import datetime
import unittest
from collections import namedtuple
from datetime import timedelta
import os
import sqlite3
import tempfile
import types

from run_page.generator import Generator
from run_page.generator.db import Activity, update_or_create_activity

RunMap = namedtuple("RunMap", "summary_polyline")
StartPoint = namedtuple("StartPoint", "lat lon")


def activity(distance):
    fields = {
        "id": 9_223_370_286_954_346_807,
        "external_id": "9223370286954346807",
        "name": "Run from keep",
        "distance": distance,
        "moving_time": timedelta(minutes=10),
        "elapsed_time": timedelta(minutes=10),
        "type": "Run",
        "subtype": "Run",
        "start_date": "2025-06-14 09:39:28",
        "start_date_local": "2025-06-14 17:39:28",
        "location_country": "中国",
        "map": RunMap("encoded-route"),
        "average_heartrate": 160,
        "average_speed": 2.0,
        "start_latlng": StartPoint(30.5, 104.0),
    }
    return namedtuple("ActivityData", fields.keys())(*fields.values())


class KeepDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.generator = Generator(":memory:")

    def tearDown(self):
        self.generator.session.close()

    def test_exact_external_id_is_stored_and_used_for_updates(self):
        self.assertTrue(
            update_or_create_activity(self.generator.session, activity(100))
        )
        self.assertFalse(
            update_or_create_activity(self.generator.session, activity(200))
        )
        self.generator.session.commit()

        rows = self.generator.session.query(Activity).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].external_id, "9223370286954346807")
        self.assertEqual(rows[0].distance, 200)
        self.assertIn(str(rows[0].external_id), self.generator.get_old_tracks_ids())


class LegacyDatabaseTests(unittest.TestCase):
    def test_time_only_intervals_are_upgraded_before_loading(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = os.path.join(directory, "legacy.db")
            generator = Generator(db_path)
            generator.session.add(
                Activity(
                    run_id=1,
                    moving_time=timedelta(minutes=10),
                    elapsed_time=timedelta(minutes=10),
                    distance=1,
                )
            )
            generator.session.commit()
            generator.session.close()

            connection = sqlite3.connect(db_path)
            connection.execute(
                "update activities set moving_time='0:10:00', elapsed_time='0:10:00'"
            )
            connection.commit()
            connection.close()

            reopened = Generator(db_path)
            row = reopened.session.query(Activity).one()
            self.assertEqual(row.moving_time, timedelta(minutes=10))
            self.assertEqual(row.elapsed_time, timedelta(minutes=10))
            reopened.session.close()


class KeepAuditComparisonTests(unittest.TestCase):
    def test_datetime_start_matches_keep_summary_text(self):
        from run_page.keep_missing_audit import compare_activities

        activity = types.SimpleNamespace(
            external_id=None,
            start_date=datetime.datetime(2025, 1, 19, 0, 23, 8),
            distance=10218.94,
        )
        summary = {
            "id": "user_9223370299605225807_rn",
            "startTime": int(
                datetime.datetime(
                    2025, 1, 19, 0, 23, 8, tzinfo=datetime.timezone.utc
                ).timestamp()
                * 1000
            ),
            "distance": 10218.94,
        }

        report = compare_activities([summary], [activity])

        self.assertEqual(report["local_match_count"], 1)
        self.assertEqual(report["missing_count"], 0)
        self.assertEqual(
            report["matched_without_exact_id"][0]["match"], "start_time_distance"
        )

    def test_rounded_javascript_id_matches_published_record(self):
        from run_page.keep_missing_audit import compare_activities

        activity = types.SimpleNamespace(
            run_id=float("9223370281897076000"),
            external_id=None,
            start_date="2025-08-12 00:07:01",
            distance=1229.1887,
        )
        summary = {
            "id": "user_9223370281897075807_rn",
            "startTime": int(
                datetime.datetime(
                    2025, 8, 12, 0, 7, 0, tzinfo=datetime.timezone.utc
                ).timestamp()
                * 1000
            ),
            "distance": 1229.1887,
        }

        report = compare_activities([summary], [activity])

        self.assertEqual(report["missing_count"], 0)
        self.assertEqual(
            report["matched_without_exact_id"][0]["match"],
            "javascript_rounded_id",
        )


if __name__ == "__main__":
    unittest.main()
