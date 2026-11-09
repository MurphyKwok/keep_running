#!/usr/bin/env python3
"""Remove local activities that no longer exist in Keep.

Keep's normal sync is append/update only, so deleting a workout in the app
leaves a stale local row forever. This tool compares the complete Keep list
for a sport with the local database and removes local rows that have no
counterpart, either by exact ID or by start time and distance.

Credentials are read from environment variables when provided:

    KEEP_MOBILE=... KEEP_PASSWORD=... python run_page/keep_prune.py --year 2025 --apply
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
from datetime import datetime

import requests
from config import JSON_FILE, SQL_FILE
from generator import Generator
from generator.db import Activity
from keep_missing_audit import keep_run_summaries, parse_utc_text, summary_utc
from keep_sync import login

RUNNING_TYPES = {"Run", "VirtualRun"}


def numeric_keep_id(raw_id):
    raw_id = str(raw_id or "")
    return raw_id.split("_")[1] if "_" in raw_id else raw_id


def keep_index(summaries):
    ids = set()
    numeric_ids = set()
    signatures = []
    for summary in summaries:
        raw_id = str(summary.get("id", ""))
        if not raw_id:
            continue
        ids.add(raw_id)
        numeric_ids.add(numeric_keep_id(raw_id))
        signatures.append(
            (
                parse_utc_text(summary_utc(summary)),
                float(summary.get("distance") or 0),
            )
        )
    return ids, numeric_ids, signatures


def matches_keep(activity, ids, numeric_ids, signatures):
    external_id = str(activity.external_id or "")
    if external_id:
        if external_id in ids or numeric_keep_id(external_id) in numeric_ids:
            return True
    if str(activity.run_id) in numeric_ids:
        return True

    activity_time = parse_utc_text(activity.start_date)
    distance = float(activity.distance or 0)
    distance_limit = max(2.0, abs(distance) * 0.005)
    for keep_time, keep_distance in signatures:
        if keep_time is None or activity_time is None:
            continue
        if abs(keep_distance - distance) > distance_limit:
            continue
        if abs((keep_time - activity_time).total_seconds()) <= 120:
            return True
    return False


def find_deleted_activities(
    activities, summaries, year=None, activity_types=RUNNING_TYPES
):
    ids, numeric_ids, signatures = keep_index(summaries)
    deleted = []
    for activity in activities:
        if activity.type not in activity_types:
            continue
        if year and str(activity.start_date or "")[:4] != str(year):
            continue
        if matches_keep(activity, ids, numeric_ids, signatures):
            continue
        deleted.append(activity)
    return deleted


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, help="only reconcile this calendar year")
    parser.add_argument("--sport", default="running")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="delete the stale rows; without it the tool only reports them",
    )
    parser.add_argument("--output", default="keep-prune.json")
    args = parser.parse_args()

    phone = os.getenv("KEEP_MOBILE") or input("Keep mobile: ")
    password = os.getenv("KEEP_PASSWORD") or getpass.getpass("Keep password: ")

    session = requests.Session()
    session, headers = login(session, phone, password)
    if not headers:
        raise SystemExit("Keep login failed")

    summaries = list(keep_run_summaries(session, headers, args.sport))
    if not summaries:
        raise SystemExit("Keep returned no activities; refusing to prune anything")
    if args.year:
        summaries = [
            item for item in summaries if summary_utc(item).startswith(str(args.year))
        ]
        if not summaries:
            raise SystemExit(
                f"Keep returned no {args.sport} activities for {args.year}; "
                "refusing to prune anything"
            )

    generator = Generator(SQL_FILE)
    candidates = find_deleted_activities(
        generator.session.query(Activity).all(), summaries, args.year
    )

    report = {
        "checked_at": datetime.now().isoformat(),
        "year": args.year,
        "keep_count": len(summaries),
        "applied": bool(args.apply),
        "deleted": [
            {
                "run_id": str(item.run_id),
                "external_id": item.external_id,
                "start_date": str(item.start_date),
                "start_date_local": str(item.start_date_local),
                "distance_m": item.distance,
            }
            for item in candidates
        ],
    }

    for item in candidates:
        print(
            f"{item.external_id or item.run_id} {item.start_date} "
            f"{item.distance}m {item.type}"
        )

    if args.apply and candidates:
        for item in candidates:
            generator.session.delete(item)
        generator.session.commit()
        activities_list = generator.load()
        with open(JSON_FILE, "w", encoding="utf-8") as handle:
            json.dump(activities_list, handle)
        print(f"Removed {len(candidates)} stale rows and regenerated {JSON_FILE}")

    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
    print(
        f"Keep={len(summaries)} stale={len(candidates)} applied={bool(args.apply)} "
        f"report={os.path.abspath(args.output)}"
    )


if __name__ == "__main__":
    main()
