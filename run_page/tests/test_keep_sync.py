import unittest
from unittest.mock import patch

from run_page import keep_sync


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload
        self.ok = True

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self, payloads):
        self.payloads = list(payloads)

    def get(self, *_args, **_kwargs):
        return FakeResponse(self.payloads.pop(0))


def page(*stats):
    return {
        "data": {
            "records": [{"logs": [{"stats": item} for item in stats]}],
            "lastTimestamp": 0,
        }
    }


class KeepSyncTests(unittest.TestCase):
    @patch("run_page.keep_sync.time.sleep")
    def test_default_sync_rejects_doubtful_activities(self, _sleep):
        session = FakeSession(
            [
                page(
                    {"id": "run_valid", "isDoubtful": False},
                    {"id": "run_doubtful", "isDoubtful": True},
                )
            ]
        )

        run_ids = keep_sync.get_to_download_runs_ids(session, {}, "running")

        self.assertEqual(run_ids, ["run_valid"])

    @patch("run_page.keep_sync.time.sleep")
    def test_complete_sync_can_include_doubtful_activities(self, _sleep):
        session = FakeSession(
            [
                page(
                    {"id": "run_valid", "isDoubtful": False},
                    {"id": "run_doubtful", "isDoubtful": True},
                )
            ]
        )

        run_ids = keep_sync.get_to_download_runs_ids(
            session, {}, "running", include_doubtful=True
        )

        self.assertEqual(run_ids, ["run_valid", "run_doubtful"])

    def test_duration_falls_back_to_activity_timestamps(self):
        run_data = {"duration": 0, "startTime": 1_000, "endTime": 62_000}

        self.assertEqual(keep_sync.effective_duration_seconds(run_data), 61)

    def test_keep_identifier_accepts_summary_and_detail_formats(self):
        self.assertEqual(
            keep_sync.keep_identifier("user_9223370281897075807_rn"),
            "9223370281897075807",
        )
        self.assertEqual(
            keep_sync.keep_identifier("9223370281897075807"),
            "9223370281897075807",
        )

    def test_parse_ignores_points_without_timestamps(self):
        run_data = {
            "id": "9223370288715359807",
            "startTime": 1_747_964_726_000,
            "endTime": 1_747_973_816_000,
            "heartRate": {"averageHeartRate": 150, "heartRates": None},
            "geoPoints": "encoded",
            "dataType": "outdoorRunning",
            "timezone": "Asia/Shanghai",
            "distance": 27030.0,
            "duration": 9090,
            "region": "",
        }
        points = [
            {"latitude": 30.5, "longitude": 104.0},
            {"latitude": 30.6, "longitude": 104.1, "timestamp": 5},
        ]

        with patch("run_page.keep_sync.decode_runmap_data", return_value=points):
            track = keep_sync.parse_raw_data_to_nametuple({"data": run_data}, [], None)

        self.assertIsNotNone(track)
        self.assertEqual(track.id, 9223370288715359807)
        self.assertEqual(track.external_id, "9223370288715359807")

    def test_point_timestamps_interpolates_missing_values(self):
        points = [
            {"timestamp": 100},
            {},
            {"timestamp": 300},
            {},
        ]

        self.assertEqual(keep_sync.point_timestamps(points), [100, 200, 300, 310])

    def test_gpx_export_handles_empty_and_untimed_points(self):
        self.assertEqual(keep_sync.parse_points_to_gpx([], 0, "Run"), "")

        points = [
            {"latitude": 30.5, "longitude": 104.0},
            {"latitude": 30.6, "longitude": 104.1},
        ]
        gpx = keep_sync.parse_points_to_gpx(points, 1_700_000_000_000, "Run")

        self.assertIn("<trkpt", gpx)
        self.assertEqual(gpx.count("<trkpt"), 2)


if __name__ == "__main__":
    unittest.main()
