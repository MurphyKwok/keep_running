#!/usr/bin/env python3
"""Recover exact Keep IDs from generated SVG routes after JavaScript rounding."""

from __future__ import annotations

import argparse
import re
import xml.etree.ElementTree as ET

from config import SQL_FILE
from generator import Generator
from generator.db import Activity

SVG_NS = "{http://www.w3.org/2000/svg}"
TITLE_RE = re.compile(r"(?P<date>\d{4}-\d{2}-\d{2})(?:\s+(?P<distance>[0-9.]+)\s*km)?")


def exact_ids_from_svg(path):
    records = []
    for _event, element in ET.iterparse(path, events=("end",)):
        if not element.tag.endswith("polyline"):
            continue
        title = element.find(f"{SVG_NS}title")
        description = element.find(f"{SVG_NS}desc")
        if title is None or description is None or not description.text:
            continue
        match = TITLE_RE.match((title.text or "").strip())
        if match:
            records.append(
                {
                    "date": match.group("date"),
                    "distance_km": (
                        float(match.group("distance"))
                        if match.group("distance")
                        else None
                    ),
                    "external_id": description.text.strip(),
                }
            )
        element.clear()
    return records


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("svg")
    parser.add_argument("--db", default=SQL_FILE)
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    exact_records = exact_ids_from_svg(args.svg)
    generator = Generator(args.db)
    activities = generator.session.query(Activity).all()
    by_rounded_id = {}
    by_signature = {}
    for record in exact_records:
        by_rounded_id.setdefault(int(float(record["external_id"])), []).append(record)
        if record["distance_km"] is not None:
            signature = (record["date"], round(record["distance_km"], 1))
            by_signature.setdefault(signature, []).append(record)

    repaired = []
    ambiguous = []
    unresolved = []
    for activity in activities:
        if activity.external_id:
            continue
        candidates = by_rounded_id.get(int(activity.run_id), [])
        if not candidates:
            signature = (
                activity.start_date_local[:10],
                round(float(activity.distance) / 1000, 1),
            )
            candidates = by_signature.get(signature, [])
        if len(candidates) != 1:
            if candidates:
                ambiguous.append((activity.run_id, candidates))
            else:
                unresolved.append(activity)
            continue

        external_id = candidates[0]["external_id"]
        collision = (
            generator.session.query(Activity)
            .filter(Activity.run_id == int(external_id), Activity != activity)
            .first()
        )
        if collision:
            unresolved.append(activity)
            continue

        repaired.append((activity.run_id, int(external_id)))
        activity.run_id = int(external_id)
        activity.external_id = external_id

    print(
        f"svg={len(exact_records)} repaired={len(repaired)} "
        f"ambiguous={len(ambiguous)} unresolved={len(unresolved)}"
    )
    if args.write:
        generator.session.commit()
        print("Database updated.")
    else:
        generator.session.rollback()
        print("Dry run only; pass --write to update the database.")


if __name__ == "__main__":
    main()
