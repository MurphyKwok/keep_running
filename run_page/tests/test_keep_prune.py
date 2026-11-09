import datetime
import types
import unittest

from run_page.keep_prune import find_deleted_activities


def activity(run_id, distance, start, external_id=None, activity_type="Run"):
    return types.SimpleNamespace(
        run_id=run_id,
        external_id=external_id,
        type=activity_type,
        distance=distance,
        start_date=start,
    )


class KeepPruneTests(unittest.TestCase):
    def test_removes_only_the_activity_missing_from_keep(self):
        kept = activity(
            200,
            10020.0,
            datetime.datetime(2025, 1, 3, 11, 24, 34),
            external_id="user_200_rn",
        )
        deleted = activity(
            300,
            1229.1887,
            datetime.datetime(2025, 8, 12, 0, 7, 0),
            external_id="user_300_rn",
        )
        summaries = [
            {
                "id": "user_200_rn",
                "startTime": int(
                    datetime.datetime(
                        2025, 1, 3, 11, 24, 34, tzinfo=datetime.timezone.utc
                    ).timestamp()
                    * 1000
                ),
                "distance": 10020.0,
            }
        ]

        self.assertEqual(
            find_deleted_activities([kept, deleted], summaries, 2025), [deleted]
        )

    def test_matches_time_and_distance_when_id_is_missing(self):
        local = activity(300, 1229.1887, datetime.datetime(2025, 8, 12, 0, 7, 0))
        summaries = [
            {
                "id": "user_999_rn",
                "startTime": int(
                    datetime.datetime(
                        2025, 8, 12, 0, 7, 1, tzinfo=datetime.timezone.utc
                    ).timestamp()
                    * 1000
                ),
                "distance": 1229.0,
            }
        ]

        self.assertEqual(find_deleted_activities([local], summaries, 2025), [])

    def test_ignores_activities_outside_the_requested_year(self):
        local = activity(300, 1229.0, datetime.datetime(2024, 8, 12, 0, 7, 0))
        summaries = [{"id": "user_200_rn", "startTime": 1, "distance": 1.0}]

        self.assertEqual(find_deleted_activities([local], summaries, 2025), [])

    def test_skips_non_running_activity_types(self):
        local = activity(
            300, 1229.0, datetime.datetime(2025, 8, 12, 0, 7, 0), activity_type="Ride"
        )
        summaries = [{"id": "user_200_rn", "startTime": 1, "distance": 1.0}]

        self.assertEqual(find_deleted_activities([local], summaries, 2025), [])


if __name__ == "__main__":
    unittest.main()
