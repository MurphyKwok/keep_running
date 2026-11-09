#!/usr/bin/env python3
"""Compare the complete Keep activity list with the locally published database.

Credentials are read from environment variables so they do not appear in shell
history or process arguments:

    KEEP_MOBILE=... KEEP_PASSWORD=... python run_page/keep_missing_audit.py --year 2025
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import time
from datetime import datetime, timezone

import requests
from config import SQL_FILE
from generator import Generator
from generator.db import Activity
from keep_sync import RUN_DATA_API, RUN_LOG_API, login


def keep_run_summaries(session, headers, sport):
    last_date = 0
    seen_timestamps = set()
    while True:
        response = session.get(
            RUN_DATA_API.format(sport_type=sport, last_date=last_date),
            headers=headers,
        )
        response.raise_for_status()
        payload = response.json()["data"]
        for day in payload.get("records", []):
            for log in day.get("logs", []):
                stats = log.get("stats", {})
                if stats:
                    yield stats

        last_date = payload.get("lastTimestamp", 0)
        if not last_date or last_date in seen_timestamps:
            break
        seen_timestamps.add(last_date)
        time.sleep(1)


def summary_utc(summary):
    try:
        stamp = int(summary["startTime"]) / 1000
    except (KeyError, TypeError, ValueError):
        return ""
    return datetime.fromtimestamp(stamp, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def summary_year(summary):
    return summary_utc(summary)[:4]


def activity_start_text(value):
    """Normalize SQLAlchemy datetimes and stored strings to UTC second text."""
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value or "").replace("T", " ")[:19]


def compare_activities(summaries, activities):
    by_external_id = {a.external_id: a for a in activities if a.external_id}
    by_rounded_id = {int(float(a.external_id)): a for a in activities if a.external_id}
    by_signature = {}
    for activity in activities:
        signature = (
            activity_start_text(activity.start_date),
            round(float(activity.distance or 0), 1),
        )
        by_signature.setdefault(signature, []).append(activity)

    matched = []
    missing = []
    for summary in summaries:
        run_id = str(summary.get("id", ""))
        start = summary_utc(summary)
        distance = round(float(summary.get("distance") or 0), 1)
        activity = by_external_id.get(run_id)
        match_type = "external_id" if activity else ""

        if not activity:
            candidates = by_signature.get((start, distance), [])
            if len(candidates) == 1:
                activity = candidates[0]
                match_type = "start_time_distance"

        if not activity:
            try:
                activity = by_rounded_id.get(int(float(run_id)))
            except (TypeError, ValueError, OverflowError):
                pass
            if activity:
                match_type = "javascript_rounded_id"

        record = {
            "id": run_id,
            "start_utc": start,
            "data_type": summary.get("dataType"),
            "distance_m": summary.get("distance"),
            "duration_s": summary.get("duration"),
            "is_doubtful": bool(summary.get("isDoubtful", False)),
            "match": match_type or None,
        }
        if activity:
            matched.append(record)
        else:
            missing.append(record)

    return {
        "keep_count": len(summaries),
        "local_match_count": len(matched),
        "missing_count": len(missing),
        "doubtful_count": sum(1 for item in summaries if item.get("isDoubtful")),
        "precision_mismatch_count": sum(
            1 for item in matched if item["match"] == "javascript_rounded_id"
        ),
        "missing": missing,
        "matched_without_exact_id": [
            item for item in matched if item["match"] != "external_id"
        ],
    }


def fetch_detail(session, headers, sport, run_id):
    response = session.get(
        RUN_LOG_API.format(sport_type=sport, run_id=run_id), headers=headers
    )
    response.raise_for_status()
    data = response.json().get("data", {})
    return {
        "id": data.get("id"),
        "data_type": data.get("dataType"),
        "duration_s": data.get("duration"),
        "distance_m": data.get("distance"),
        "has_gps": bool(data.get("geoPoints")),
        "has_heart_rate": bool(data.get("heartRate")),
        "calories": data.get("calorie") or data.get("calories"),
        "steps": data.get("steps") or data.get("step"),
        "cadence": data.get("cadence") or data.get("averageCadence"),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="only audit one calendar year")
    parser.add_argument("--sport", default="running")
    parser.add_argument("--output", default="keep-audit.json")
    parser.add_argument(
        "--include-details",
        action="store_true",
        help="fetch full detail responses for activities missing locally",
    )
    parser.add_argument("--fail-on-missing", action="store_true")
    args = parser.parse_args()

    phone = os.getenv("KEEP_MOBILE") or input("Keep mobile: ")
    password = os.getenv("KEEP_PASSWORD") or getpass.getpass("Keep password: ")

    session = requests.Session()
    session, headers = login(session, phone, password)
    if not headers:
        raise SystemExit("Keep login failed")

    summaries = list(keep_run_summaries(session, headers, args.sport))
    if args.year:
        summaries = [item for item in summaries if summary_year(item) == str(args.year)]

    generator = Generator(SQL_FILE)
    activities = generator.session.query(Activity).all()
    print(f"Loaded {len(activities)} local activities from {SQL_FILE}")
    report = compare_activities(summaries, activities)
    report.update(
        {
            "audited_at": datetime.now(tz=timezone.utc).isoformat(),
            "year": args.year,
            "sport": args.sport,
        }
    )

    if args.include_details:
        for item in report["missing"]:
            try:
                item["detail"] = fetch_detail(session, headers, args.sport, item["id"])
            except Exception as error:  # Keep the report useful despite one bad record.
                item["detail_error"] = str(error)

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)

    print(
        "Keep={keep_count} local={local_match_count} missing={missing_count} "
        "doubtful={doubtful_count} rounded_ids={precision_mismatch_count}".format(
            **report
        )
    )
    for item in report["missing"]:
        print(
            "{id} {start_utc} {distance_m}m duration={duration_s}s "
            "doubtful={is_doubtful}".format(**item)
        )
    print(f"Report: {os.path.abspath(args.output)}")

    if args.fail_on_missing and report["missing_count"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
