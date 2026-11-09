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
            [page({"id": "run_valid", "isDoubtful": False}, {"id": "run_doubtful", "isDoubtful": True})]
        )

        run_ids = keep_sync.get_to_download_runs_ids(session, {}, "running")

        self.assertEqual(run_ids, ["run_valid"])

    @patch("run_page.keep_sync.time.sleep")
    def test_complete_sync_can_include_doubtful_activities(self, _sleep):
        session = FakeSession(
            [page({"id": "run_valid", "isDoubtful": False}, {"id": "run_doubtful", "isDoubtful": True})]
        )

        run_ids = keep_sync.get_to_download_runs_ids(
            session, {}, "running", include_doubtful=True
        )

        self.assertEqual(run_ids, ["run_valid", "run_doubtful"])

    def test_duration_falls_back_to_activity_timestamps(self):
        run_data = {"duration": 0, "startTime": 1_000, "endTime": 62_000}

        self.assertEqual(keep_sync.effective_duration_seconds(run_data), 61)


if __name__ == "__main__":
    unittest.main()
