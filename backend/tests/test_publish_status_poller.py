"""Tests for the publish status poller and finalize_job."""

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from services.job_executor import finalize_job
from services.publish_status_poller import PublishStatusPoller, _process_job


def _entry(pid="p1", state="SUBMITTED", result=None, name="Guide"):
    return {"fileId": f"f-{pid}", "publishId": pid, "documentName": name,
            "state": state, "result": result, "message": ""}


def _job(entries, errors=None, started_ago=10):
    job = MagicMock()
    job.id = "job-1"
    job.status = "running"
    job.publish_jobs = json.dumps(entries)
    job.response_payload = json.dumps({"results": [], "errors": errors or []})
    job.started_at = datetime.now(timezone.utc) - timedelta(seconds=started_ago)
    job.schedule = MagicMock(id="sched-1", consecutive_failures=0, enabled=True)
    return job


def _status(state, result=None, message=""):
    return {"state": state, "result": result, "message": message}


@pytest.fixture
def heretto():
    client = MagicMock()
    client.get_publish_status = AsyncMock()
    with patch("services.publish_status_poller.get_heretto_connection"), \
         patch("services.publish_status_poller.HerettoClient", return_value=client), \
         patch("services.job_executor._create_pending_deliveries") as deliveries:
        client.deliveries = deliveries
        yield client


@pytest.mark.asyncio
class TestProcessJob:
    async def test_still_in_progress_keeps_job_running(self, heretto):
        job = _job([_entry()])
        heretto.get_publish_status.return_value = _status("IN_PROGRESS")
        db = MagicMock()
        await _process_job(job, db, 1800)
        assert job.status == "running"
        assert json.loads(job.publish_jobs)[0]["state"] == "IN_PROGRESS"
        db.commit.assert_called()

    async def test_all_success_completes_and_creates_deliveries(self, heretto):
        job = _job([_entry("p1"), _entry("p2")])
        heretto.get_publish_status.return_value = _status("DONE", "SUCCESS")
        job.schedule.consecutive_failures = 2
        await _process_job(job, MagicMock(), 1800)
        assert job.status == "completed"
        assert job.error is None
        assert job.completed_at is not None
        assert job.schedule.last_run_status == "completed"
        assert job.schedule.consecutive_failures == 0
        heretto.deliveries.assert_called_once()

    async def test_heretto_fail_fails_job_with_message_and_no_delivery(self, heretto):
        job = _job([_entry(name="My Map")])
        heretto.get_publish_status.return_value = _status("DONE", "FAIL", "Property args.filter cannot be set")
        await _process_job(job, MagicMock(), 1800)
        assert job.status == "failed"
        assert "My Map: Property args.filter cannot be set" in job.error
        assert job.schedule.consecutive_failures == 1
        heretto.deliveries.assert_not_called()

    async def test_waits_until_every_publish_is_done(self, heretto):
        job = _job([_entry("p1"), _entry("p2")])
        heretto.get_publish_status.side_effect = [_status("DONE", "SUCCESS"), _status("QUEUED")]
        await _process_job(job, MagicMock(), 1800)
        assert job.status == "running"
        states = [e["state"] for e in json.loads(job.publish_jobs)]
        assert states == ["DONE", "QUEUED"]

    async def test_done_entries_are_not_requeried(self, heretto):
        job = _job([_entry("p1", "DONE", "SUCCESS"), _entry("p2")])
        heretto.get_publish_status.return_value = _status("DONE", "SUCCESS")
        await _process_job(job, MagicMock(), 1800)
        assert heretto.get_publish_status.await_count == 1

    async def test_submit_errors_fail_job_even_if_publishes_succeed(self, heretto):
        job = _job([_entry()], errors=["scenario=2, locale=source: API error"])
        heretto.get_publish_status.return_value = _status("DONE", "SUCCESS")
        await _process_job(job, MagicMock(), 1800)
        assert job.status == "failed"
        assert "API error" in job.error

    async def test_timeout_fails_job(self, heretto):
        job = _job([_entry(name="Slow Map")], started_ago=5000)
        heretto.get_publish_status.return_value = _status("IN_PROGRESS")
        await _process_job(job, MagicMock(), 1800)
        assert job.status == "failed"
        assert "Timed out" in job.error and "Slow Map" in job.error

    async def test_404_marks_publish_failed(self, heretto):
        job = _job([_entry()])
        heretto.get_publish_status.side_effect = HTTPException(404, "not found")
        await _process_job(job, MagicMock(), 1800)
        assert job.status == "failed"
        assert "not found in Heretto" in job.error

    async def test_transient_error_keeps_polling(self, heretto):
        job = _job([_entry()])
        heretto.get_publish_status.side_effect = HTTPException(502, "Heretto API error (503)")
        await _process_job(job, MagicMock(), 1800)
        assert job.status == "running"

    async def test_job_with_no_publishes_yet_is_left_alone(self, heretto):
        job = _job([])
        await _process_job(job, MagicMock(), 1800)
        heretto.get_publish_status.assert_not_called()
        assert job.status == "running"

    async def test_naive_started_at_from_sqlite_is_handled(self, heretto):
        job = _job([_entry()])
        job.started_at = datetime.utcnow()  # naive, as SQLite returns it
        heretto.get_publish_status.return_value = _status("IN_PROGRESS")
        await _process_job(job, MagicMock(), 1800)
        assert job.status == "running"


@pytest.mark.asyncio
async def test_tick_isolates_failures_between_jobs():
    bad, good = MagicMock(id="bad"), MagicMock(id="good")
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = [bad, good]
    seen = []

    async def fake(job, db_, timeout):
        seen.append(job.id)
        if job.id == "bad":
            raise RuntimeError("boom")

    with patch("services.publish_status_poller._process_job", fake):
        await PublishStatusPoller().tick(db, 1800)
    assert seen == ["bad", "good"]
    db.rollback.assert_called_once()


class TestFinalizeJob:
    def test_auto_disables_schedule_at_failure_threshold(self):
        job = _job([_entry()])
        job.schedule.consecutive_failures = 4
        with patch("services.job_executor.get_settings") as gs:
            gs.return_value.scheduler_max_consecutive_failures = 5
            finalize_job(job, job.schedule, MagicMock(), error="boom")
        assert job.schedule.enabled is False
        assert job.status == "failed" and job.error == "boom"
