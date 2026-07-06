"""Tests for the dashboard summary endpoint and scheduler.next_run_time helper."""

import json
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch


# ── helpers ────────────────────────────────────────────────────────────────────

def _make_ctx(org_id="org-1"):
    ctx = MagicMock()
    ctx.organization_id = org_id
    return ctx


def _make_schedule_row(schedule_id="sched-1"):
    row = MagicMock()
    row.id = schedule_id
    return row


def _make_db(schedule_rows=None, stat_rows=None, vol_rows=None, payload_rows=None):
    """
    Return a mock DB whose query() calls are answered in order:
      1. Schedule IDs (for org_ids)
      2. per-schedule-stats rows  → (schedule_id, status, count) tuples
      3. daily-volumes rows       → (date_str, status, count) tuples
      4. request_payload rows     → (payload_str, status, schedule_id) tuples
    """
    db = MagicMock()
    results = [
        schedule_rows or [],
        stat_rows or [],
        vol_rows or [],
        payload_rows or [],
    ]
    call_count = [0]

    def _chain(idx):
        chain = MagicMock()
        chain.filter.return_value = chain
        chain.group_by.return_value = chain
        chain.order_by.return_value = chain
        chain.limit.return_value = chain
        chain.all.return_value = results[idx]
        return chain

    def _query_side(*args):
        idx = min(call_count[0], len(results) - 1)
        call_count[0] += 1
        return _chain(idx)

    db.query.side_effect = _query_side
    return db


# ── scheduler.next_run_time ───────────────────────────────────────────────────

class TestNextRunTime:
    def test_returns_none_when_job_not_registered(self):
        from services import scheduler as sched
        assert sched.next_run_time("does-not-exist") is None

    def test_returns_iso_string_when_job_has_next_run(self):
        from services import scheduler as sched
        dt = datetime(2026, 7, 1, 9, 0, 0, tzinfo=timezone.utc)
        mock_job = MagicMock()
        mock_job.next_run_time = dt

        with patch.object(sched._scheduler, "get_job", return_value=mock_job):
            result = sched.next_run_time("sched-abc")

        assert result == dt.isoformat()

    def test_returns_none_when_job_next_run_is_none(self):
        from services import scheduler as sched
        mock_job = MagicMock()
        mock_job.next_run_time = None

        with patch.object(sched._scheduler, "get_job", return_value=mock_job):
            result = sched.next_run_time("sched-abc")

        assert result is None

    def test_job_id_includes_schedule_prefix(self):
        """Ensures the correct APScheduler job ID format is looked up."""
        from services import scheduler as sched
        with patch.object(sched._scheduler, "get_job", return_value=None) as mock_get:
            sched.next_run_time("my-id")
            mock_get.assert_called_once_with("schedule:my-id")


# ── _fmt includes next_run_time ───────────────────────────────────────────────

class TestFmtNextRunTime:
    def test_fmt_includes_next_run_time_key(self):
        from routes.schedules import _fmt
        from services import scheduler as sched

        s = MagicMock()
        s.id = "sched-1"
        s.org_id = "org-1"
        s.name = "Test"
        s.description = ""
        s.cron_expression = "0 9 * * *"
        s.scenario_id = '["500009"]'
        s.deployment_id = "dep-1"
        s.document_ids = "[]"
        s.folder_ids = "[]"
        s.document_releases = "{}"
        s.enabled = True
        s.branch = "master"
        s.locale = ""
        s.publish_parameters = "[]"
        s.last_run_at = None
        s.last_run_status = None
        s.consecutive_failures = 0
        s.created_at = None
        s.updated_at = None

        with patch.object(sched, "next_run_time", return_value="2026-07-01T09:00:00+00:00"):
            result = _fmt(s)

        assert "next_run_time" in result
        assert result["next_run_time"] == "2026-07-01T09:00:00+00:00"

    def test_fmt_next_run_time_is_none_when_not_scheduled(self):
        from routes.schedules import _fmt
        from services import scheduler as sched

        s = MagicMock()
        s.id = "sched-1"
        s.org_id = "org-1"
        s.name = "Test"
        s.description = ""
        s.cron_expression = "0 9 * * *"
        s.scenario_id = "[]"
        s.deployment_id = ""
        s.document_ids = "[]"
        s.folder_ids = "[]"
        s.document_releases = "{}"
        s.enabled = False
        s.branch = "master"
        s.locale = ""
        s.publish_parameters = "[]"
        s.last_run_at = None
        s.last_run_status = None
        s.consecutive_failures = 0
        s.created_at = None
        s.updated_at = None

        with patch.object(sched, "next_run_time", return_value=None):
            result = _fmt(s)

        assert result["next_run_time"] is None


# ── get_summary ────────────────────────────────────────────────────────────────

class TestGetSummary:

    def test_empty_org_returns_empty_stats_and_14_day_zeros(self):
        from routes.dashboard import get_summary
        ctx = _make_ctx()
        db = _make_db()

        result = get_summary(ctx, db)

        assert result["per_schedule_stats"] == {}
        assert result["top_locales"] == {}
        assert len(result["daily_volumes"]) == 14
        for day in result["daily_volumes"]:
            assert day["total"] == 0
            assert day["succeeded"] == 0
            assert day["failed"] == 0

    def test_daily_volumes_spans_exactly_14_days(self):
        from routes.dashboard import get_summary
        result = get_summary(_make_ctx(), _make_db())
        dates = [d["date"] for d in result["daily_volumes"]]
        # Dates should be unique, sorted ascending, and 14 of them
        assert len(dates) == len(set(dates)) == 14
        assert dates == sorted(dates)

    def test_daily_volumes_last_entry_is_today(self):
        from routes.dashboard import get_summary
        result = get_summary(_make_ctx(), _make_db())
        today = datetime.now(timezone.utc).date().isoformat()
        assert result["daily_volumes"][-1]["date"] == today

    # ── per_schedule_stats ────────────────────────────────────────────────────

    def test_completed_jobs_counted_as_succeeded(self):
        from routes.dashboard import get_summary
        stat_rows = [("sched-1", "completed", 5)]
        db = _make_db(
            schedule_rows=[_make_schedule_row("sched-1")],
            stat_rows=stat_rows,
        )
        result = get_summary(_make_ctx(), db)
        stats = result["per_schedule_stats"]["sched-1"]
        assert stats["succeeded"] == 5
        assert stats["total"] == 5
        assert stats["failed"] == 0

    def test_failed_jobs_counted_as_failed(self):
        from routes.dashboard import get_summary
        stat_rows = [("sched-1", "failed", 3)]
        db = _make_db(
            schedule_rows=[_make_schedule_row("sched-1")],
            stat_rows=stat_rows,
        )
        result = get_summary(_make_ctx(), db)
        stats = result["per_schedule_stats"]["sched-1"]
        assert stats["failed"] == 3
        assert stats["succeeded"] == 0
        assert stats["total"] == 3

    def test_running_jobs_counted_in_total_only(self):
        from routes.dashboard import get_summary
        stat_rows = [
            ("sched-1", "completed", 4),
            ("sched-1", "failed", 1),
            ("sched-1", "running", 2),
        ]
        db = _make_db(
            schedule_rows=[_make_schedule_row("sched-1")],
            stat_rows=stat_rows,
        )
        result = get_summary(_make_ctx(), db)
        stats = result["per_schedule_stats"]["sched-1"]
        assert stats["total"] == 7
        assert stats["succeeded"] == 4
        assert stats["failed"] == 1

    def test_multiple_schedules_aggregated_separately(self):
        from routes.dashboard import get_summary
        stat_rows = [
            ("sched-1", "completed", 10),
            ("sched-2", "completed", 2),
            ("sched-2", "failed", 1),
        ]
        db = _make_db(
            schedule_rows=[_make_schedule_row("sched-1"), _make_schedule_row("sched-2")],
            stat_rows=stat_rows,
        )
        result = get_summary(_make_ctx(), db)
        assert result["per_schedule_stats"]["sched-1"]["succeeded"] == 10
        assert result["per_schedule_stats"]["sched-2"]["succeeded"] == 2
        assert result["per_schedule_stats"]["sched-2"]["failed"] == 1

    # ── daily_volumes ─────────────────────────────────────────────────────────

    def test_daily_volumes_aggregates_by_date(self):
        from routes.dashboard import get_summary
        today = datetime.now(timezone.utc).date().isoformat()
        vol_rows = [
            (today, "completed", 3),
            (today, "failed", 1),
        ]
        db = _make_db(
            schedule_rows=[_make_schedule_row()],
            vol_rows=vol_rows,
        )
        result = get_summary(_make_ctx(), db)
        today_entry = result["daily_volumes"][-1]
        assert today_entry["date"] == today
        assert today_entry["total"] == 4
        assert today_entry["succeeded"] == 3
        assert today_entry["failed"] == 1

    def test_daily_volumes_zero_fills_missing_dates(self):
        from routes.dashboard import get_summary
        # Only provide data for today; all other 13 days should be zeros
        today = datetime.now(timezone.utc).date().isoformat()
        vol_rows = [(today, "completed", 1)]
        db = _make_db(schedule_rows=[_make_schedule_row()], vol_rows=vol_rows)

        result = get_summary(_make_ctx(), db)
        non_today = [d for d in result["daily_volumes"] if d["date"] != today]
        for day in non_today:
            assert day["total"] == 0

    # ── top_locales ───────────────────────────────────────────────────────────

    def test_locales_counted_from_request_payload(self):
        from routes.dashboard import get_summary
        payloads = [
            (json.dumps({"locales": ["en-us", "fr-fr"]}), "completed", "sched-1"),
            (json.dumps({"locales": ["en-us"]}), "completed", "sched-1"),
        ]
        db = _make_db(
            schedule_rows=[_make_schedule_row()],
            payload_rows=payloads,
        )
        result = get_summary(_make_ctx(), db)
        assert result["top_locales"]["en-us"]["total"] == 2
        assert result["top_locales"]["fr-fr"]["total"] == 1

    def test_top_locales_capped_at_10(self):
        from routes.dashboard import get_summary
        # 11 distinct locales, each appearing once except the first which appears twice
        locales = [f"lang-{i:02d}" for i in range(11)]
        payloads = [(json.dumps({"locales": locales}), "completed", "sched-1")]
        db = _make_db(schedule_rows=[_make_schedule_row()], payload_rows=payloads)

        result = get_summary(_make_ctx(), db)
        assert len(result["top_locales"]) == 10

    def test_top_locales_sorted_by_count_descending(self):
        from routes.dashboard import get_summary
        payloads = [
            (json.dumps({"locales": ["en-us"]}), "completed", "sched-1"),
            (json.dumps({"locales": ["en-us"]}), "completed", "sched-1"),
            (json.dumps({"locales": ["fr-fr"]}), "completed", "sched-1"),
        ]
        db = _make_db(schedule_rows=[_make_schedule_row()], payload_rows=payloads)

        result = get_summary(_make_ctx(), db)
        counts = [v["total"] for v in result["top_locales"].values()]
        assert counts == sorted(counts, reverse=True)
        assert list(result["top_locales"].keys())[0] == "en-us"

    def test_malformed_payload_json_is_skipped(self):
        from routes.dashboard import get_summary
        payloads = [
            ("not valid json", "completed", "sched-1"),
            (json.dumps({"locales": ["en-us"]}), "completed", "sched-1"),
            (None, "completed", "sched-1"),
        ]
        db = _make_db(schedule_rows=[_make_schedule_row()], payload_rows=payloads)

        result = get_summary(_make_ctx(), db)
        # Only the valid payload should contribute
        assert result["top_locales"].get("en-us", {}).get("total") == 1

    def test_payload_without_locales_key_is_skipped(self):
        from routes.dashboard import get_summary
        payloads = [
            (json.dumps({"documentIds": ["doc-1"]}), "completed", "sched-1"),
        ]
        db = _make_db(schedule_rows=[_make_schedule_row()], payload_rows=payloads)

        result = get_summary(_make_ctx(), db)
        assert result["top_locales"] == {}
