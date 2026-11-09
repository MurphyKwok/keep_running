#!/usr/bin/env python3
"""Build the WeChat Mini Program data module from the published activities.

The Mini Program cannot request github.io, so the activity list and encoded
polylines are bundled with the package. Run this after a Keep sync and before
uploading a Mini Program version.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "src/static/activities.json"
DEFAULT_OUTPUT = ROOT / "miniprogram/data/activities.js"

CITY_PATTERNS = (
    re.compile(r"'city':\s*'([^']*)'"),
    re.compile(r'"city":\s*"([^"]*)"'),
)

METERS_PER_DEGREE = 111_320.0


def city_name(raw):
    raw = raw or ""
    for pattern in CITY_PATTERNS:
        match = pattern.search(raw)
        if match:
            return match.group(1)
    return ""


def decode_polyline(encoded):
    """Decode a Google encoded polyline into ``(lat, lng)`` tuples."""
    points = []
    index = 0
    latitude = 0
    longitude = 0
    length = len(encoded)
    while index < length:
        deltas = []
        for _ in range(2):
            shift = 0
            result = 0
            while True:
                if index >= length:
                    raise ValueError("truncated polyline")
                value = ord(encoded[index]) - 63
                index += 1
                result |= (value & 0x1F) << shift
                shift += 5
                if value < 0x20:
                    break
            deltas.append(~(result >> 1) if result & 1 else (result >> 1))
        latitude += deltas[0]
        longitude += deltas[1]
        points.append((latitude / 1e5, longitude / 1e5))
    return points


def encode_polyline(points):
    """Encode ``(lat, lng)`` tuples back into a Google encoded polyline."""
    output = []
    previous_lat = 0
    previous_lng = 0
    for latitude, longitude in points:
        current_lat = round(latitude * 1e5)
        current_lng = round(longitude * 1e5)
        for delta in (current_lat - previous_lat, current_lng - previous_lng):
            value = ~(delta << 1) if delta < 0 else (delta << 1)
            while value >= 0x20:
                output.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            output.append(chr(value + 63))
        previous_lat = current_lat
        previous_lng = current_lng
    return "".join(output)


def _distance_to_segment(point, start, end):
    px, py = point
    ax, ay = start
    bx, by = end
    if ax == bx and ay == by:
        return math.hypot(px - ax, py - ay)
    dx = bx - ax
    dy = by - ay
    ratio = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    ratio = max(0.0, min(1.0, ratio))
    return math.hypot(px - (ax + ratio * dx), py - (ay + ratio * dy))


def simplify_points(points, tolerance_meters):
    """Keep the shape of a GPS track with Douglas-Peucker simplification."""
    if tolerance_meters <= 0 or len(points) < 3:
        return list(points)
    reference = sum(latitude for latitude, _ in points) / len(points)
    longitude_scale = math.cos(math.radians(reference)) * METERS_PER_DEGREE
    projected = [
        (longitude * longitude_scale, latitude * METERS_PER_DEGREE)
        for latitude, longitude in points
    ]
    last_index = len(points) - 1
    keep = {0, last_index}
    stack = [(0, last_index)]
    while stack:
        start, end = stack.pop()
        farthest = -1.0
        farthest_index = None
        for index in range(start + 1, end):
            distance = _distance_to_segment(
                projected[index], projected[start], projected[end]
            )
            if distance > farthest:
                farthest = distance
                farthest_index = index
        if farthest_index is not None and farthest > tolerance_meters:
            keep.add(farthest_index)
            stack.append((start, farthest_index))
            stack.append((farthest_index, end))
    return [points[index] for index in sorted(keep)]


def compact_polyline(encoded, tolerance_meters):
    if not encoded:
        return ""
    points = decode_polyline(encoded)
    simplified = simplify_points(points, tolerance_meters)
    return encode_polyline(simplified) if len(simplified) != len(points) else encoded


def compact_activity(row, tolerance_meters):
    activity = {
        "i": str(row["run_id"]),
        "n": row.get("name") or "跑步",
        "d": round(float(row.get("distance") or 0), 2),
        "t": row.get("moving_time") or "0:00:00",
        "s": row.get("start_date_local") or "",
        "h": int(row.get("average_heartrate") or 0),
        "p": compact_polyline(row.get("summary_polyline") or "", tolerance_meters),
        "c": city_name(row.get("location_country")),
        "y": (row.get("start_date_local") or "")[:4],
    }
    optional_fields = {
        "calories": "cal",
        "average_cadence": "cad",
        "step_count": "steps",
    }
    for source, compact in optional_fields.items():
        value = row.get(source)
        if value not in (None, ""):
            activity[compact] = value
    return activity


def build(rows, tolerance_meters):
    return [
        compact_activity(row, tolerance_meters)
        for row in rows
        if row.get("start_date_local")
    ]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(DEFAULT_INPUT))
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT))
    parser.add_argument(
        "--simplify-meters",
        type=float,
        default=2.0,
        help=(
            "Douglas-Peucker tolerance for bundled GPS tracks. WeChat caps a "
            "Mini Program package at 2 MB while raw Keep tracks are far larger; "
            "2 m keeps the visual shape. Use 0 to keep every original point."
        ),
    )
    args = parser.parse_args()

    with open(args.input, encoding="utf-8") as handle:
        rows = json.load(handle)
    compact = build(rows, args.simplify_meters)
    payload = json.dumps(compact, ensure_ascii=False, separators=(",", ":"))
    header = (
        "// Generated by run_page/generate_miniprogram_data.py\n"
        f"// {len(compact)} activities bundled from src/static/activities.json\n"
    )
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as handle:
        handle.write(header + "module.exports=" + payload + ";\n")
    print(
        f"Wrote {len(compact)} activities to {args.output} "
        f"({output.stat().st_size / 1024:.1f} KiB, "
        f"tolerance {args.simplify_meters:g} m)"
    )


if __name__ == "__main__":
    main()
