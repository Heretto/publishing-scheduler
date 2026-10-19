"""Status exclusions: maps with an excluded status can't be scheduled or published."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from services import status_exclusions
from tests.test_job_executor import _make_db, _make_schedule


def _ccms(statuses):
    ccms = MagicMock()
    ccms.get_document_status = AsyncMock(side_effect=lambda doc_id: statuses[doc_id])
    ccms.get_document_info = AsyncMock(return_value={})
    ccms.get_ditamaps_in_folder = AsyncMock(return_value=[])
    ccms.get_document_locales = AsyncMock(return_value=[])
    return ccms


@pytest.mark.asyncio
class TestDocumentStatuses:
    async def test_uses_the_cache_and_looks_up_the_rest(self, heretto_conn):
        ccms = _ccms({"doc-2": "in_review"})
        cache = {"doc-1": "approved"}
        with patch("services.status_cache.get", side_effect=lambda conn_id, d: cache.get(d)), \
             patch("services.status_cache.ensure_loading"), \
             patch("clients.heretto_ccms.HerettoCcmsClient", return_value=ccms):
            statuses = await status_exclusions.document_statuses(heretto_conn, ["doc-1", "doc-2"])
        assert statuses == {"doc-1": "approved", "doc-2": "in_review"}
        ccms.get_document_status.assert_awaited_once_with("doc-2")

    async def test_unreadable_status_counts_as_none(self, heretto_conn):
        ccms = MagicMock()
        ccms.get_document_status = AsyncMock(side_effect=RuntimeError("boom"))
        with patch("services.status_cache.get", return_value=None), \
             patch("services.status_cache.ensure_loading"), \
             patch("clients.heretto_ccms.HerettoCcmsClient", return_value=ccms):
            assert await status_exclusions.document_statuses(heretto_conn, ["doc-1"]) == {"doc-1": ""}

    async def test_excluded_documents(self, heretto_conn):
        with patch("services.status_exclusions.excluded_values", return_value={"in_progress"}), \
             patch("services.status_exclusions.document_statuses",
                   AsyncMock(return_value={"doc-1": "approved", "doc-2": "in_progress"})):
            excluded = await status_exclusions.excluded_documents(heretto_conn, "org", MagicMock(), ["doc-1", "doc-2"])
        assert excluded == {"doc-2": "in_progress"}

    async def test_no_exclusions_skips_lookups(self, heretto_conn):
        lookup = AsyncMock()
        with patch("services.status_exclusions.excluded_values", return_value=set()), \
             patch("services.status_exclusions.document_statuses", lookup):
            assert await status_exclusions.excluded_documents(heretto_conn, "org", MagicMock(), ["doc-1"]) == {}
        lookup.assert_not_awaited()


@pytest.fixture
def executor(mock_settings, heretto_conn):
    from services.job_executor import JobExecutorService
    client = MagicMock()
    client.trigger_publishing_job = AsyncMock(return_value=[{"id": "p1", "status": "submitted", "fileId": "doc-1"}])
    client.get_scenarios = AsyncMock(return_value=[])
    with patch("services.job_executor.get_heretto_connection", return_value=heretto_conn), \
         patch("services.job_executor.HerettoClient", return_value=client):
        yield JobExecutorService(), client


@pytest.mark.asyncio
class TestExecutorSkipsExcluded:
    async def test_excluded_maps_are_not_published(self, executor):
        svc, client = executor
        schedule = _make_schedule(document_ids='["doc-1", "doc-2"]')
        db, job = _make_db(schedule)
        with patch("services.job_executor.HerettoCcmsClient", return_value=_ccms({})), \
             patch("services.job_executor.excluded_documents", AsyncMock(return_value={"doc-2": "in_progress"})), \
             patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)
        assert client.trigger_publishing_job.call_args.kwargs["document_ids"] == ["doc-1"]
        payload = json.loads(MockJobHistory.call_args.kwargs["request_payload"])
        assert payload["excludedDocuments"] == {"doc-2": "in_progress"}

    async def test_maps_found_in_folders_are_checked_too(self, executor):
        svc, client = executor
        schedule = _make_schedule(document_ids="[]", folder_ids='["folder-1"]')
        db, job = _make_db(schedule)
        ccms = _ccms({})
        ccms.get_ditamaps_in_folder = AsyncMock(return_value=[{"id": "map-a"}, {"id": "map-b"}])
        exclusions = AsyncMock(return_value={"map-b": "in_progress"})
        with patch("services.job_executor.HerettoCcmsClient", return_value=ccms), \
             patch("services.job_executor.excluded_documents", exclusions), \
             patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)
        assert exclusions.await_args.args[3] == ["map-a", "map-b"]
        assert client.trigger_publishing_job.call_args.kwargs["document_ids"] == ["map-a"]

    async def test_all_excluded_records_a_skipped_run(self, executor):
        svc, client = executor
        schedule = _make_schedule(document_ids='["doc-1"]')
        db, job = _make_db(schedule)
        with patch("services.job_executor.HerettoCcmsClient", return_value=_ccms({})), \
             patch("services.job_executor.excluded_documents", AsyncMock(return_value={"doc-1": "in_progress"})), \
             patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)
        kwargs = MockJobHistory.call_args.kwargs
        assert kwargs["status"] == "skipped"
        payload = json.loads(kwargs["request_payload"])
        assert payload["reason"] == "Every document has an excluded status (in_progress)"
        assert payload["excludedDocuments"] == {"doc-1": "in_progress"}
        assert schedule.last_run_status == "skipped"
        client.trigger_publishing_job.assert_not_awaited()
        assert not svc.is_running("sched-1")


@pytest.mark.asyncio
class TestSaveRejectsExcluded:
    async def test_rejects_excluded_maps(self, heretto_conn):
        from routes.schedules import _reject_excluded_maps
        with patch("routes.schedules.get_heretto_connection", return_value=heretto_conn), \
             patch("routes.schedules.excluded_documents", AsyncMock(return_value={"doc-2": "in_progress"})):
            with pytest.raises(HTTPException) as exc:
                await _reject_excluded_maps("org", ["doc-1", "doc-2"], MagicMock())
        assert exc.value.status_code == 400
        assert "doc-2 (in_progress)" in exc.value.detail

    async def test_allows_maps_without_excluded_statuses(self, heretto_conn):
        from routes.schedules import _reject_excluded_maps
        with patch("routes.schedules.get_heretto_connection", return_value=heretto_conn), \
             patch("routes.schedules.excluded_documents", AsyncMock(return_value={})):
            await _reject_excluded_maps("org", ["doc-1"], MagicMock())

    async def test_without_a_connection_nothing_is_checked(self):
        from routes.schedules import _reject_excluded_maps
        from services.heretto_connection import NoHerettoConnection
        lookup = AsyncMock()
        with patch("routes.schedules.get_heretto_connection", side_effect=NoHerettoConnection("none")), \
             patch("routes.schedules.excluded_documents", lookup):
            await _reject_excluded_maps("org", ["doc-1"], MagicMock())
        lookup.assert_not_awaited()
