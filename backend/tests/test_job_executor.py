"""Tests for JobExecutorService — multi-scenario × locale execution."""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_schedule(
    schedule_id="sched-1",
    scenario_id='["500009"]',
    locale="",
    document_ids='["doc-1"]',
    folder_ids="[]",
    document_releases="{}",
    deployment_id="dep-1",
    publish_parameters="[]",
    enabled=True,
    consecutive_failures=0,
):
    s = MagicMock()
    s.id = schedule_id
    s.scenario_id = scenario_id
    s.locale = locale
    s.document_ids = document_ids
    s.folder_ids = folder_ids
    s.document_releases = document_releases
    s.deployment_id = deployment_id
    s.publish_parameters = publish_parameters
    s.enabled = enabled
    s.consecutive_failures = consecutive_failures
    s.last_run_at = None
    s.last_run_status = None
    return s


def _make_db(schedule=None):
    """Return a mock DB session that returns the given schedule on query."""
    db = MagicMock()
    query_chain = db.query.return_value.filter.return_value
    query_chain.first.return_value = schedule

    # job created via db.add / db.commit / db.refresh
    job = MagicMock()
    job.id = "job-1"
    job.schedule_id = schedule.id if schedule else None
    job.status = "running"
    job.trigger_type = "manual"
    job.started_at = None
    job.completed_at = None
    job.heretto_job_id = None
    job.request_payload = "{}"
    job.response_payload = "{}"
    job.error = None

    # Make db.refresh populate job attributes from what was set before the call
    def _refresh(obj):
        pass

    db.refresh.side_effect = _refresh
    db.add.return_value = None

    return db, job


@pytest.fixture
def executor(mock_settings):
    from services.job_executor import JobExecutorService
    svc = JobExecutorService()
    # Inject a mock Heretto client
    mock_client = MagicMock()
    mock_client.trigger_publishing_job = AsyncMock(return_value=[
        {"id": "job-heretto-1", "status": "submitted", "fileId": "doc-1"}
    ])
    svc._client = mock_client
    return svc, mock_client


class TestIsRunning:
    def test_not_running_initially(self, executor):
        svc, _ = executor
        assert svc.is_running("sched-1") is False

    def test_running_count_zero_initially(self, executor):
        svc, _ = executor
        assert svc.running_count() == 0


@pytest.mark.asyncio
class TestExecute:
    async def test_missing_schedule_raises(self, executor):
        svc, _ = executor
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        with pytest.raises(ValueError, match="not found"):
            await svc.execute("no-such-id", db)

    async def test_already_running_raises(self, executor):
        svc, _ = executor
        svc._running.add("sched-1")
        db = MagicMock()

        with pytest.raises(RuntimeError, match="already running"):
            await svc.execute("sched-1", db)

        svc._running.discard("sched-1")

    async def test_single_scenario_no_locale_calls_publish_once(self, executor):
        svc, mock_client = executor
        schedule = _make_schedule(scenario_id='["500009"]', locale="", document_ids='["doc-1"]')
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        mock_client.trigger_publishing_job.assert_awaited_once_with(
            scenario_id="500009",
            deployment_id="dep-1",
            document_ids=["doc-1"],
            parameters=[],
        )

    async def test_multiple_scenarios_calls_publish_for_each(self, executor):
        svc, mock_client = executor
        schedule = _make_schedule(
            scenario_id='["500009", "500010"]',
            locale="",
            document_ids='["doc-1"]',
        )
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        assert mock_client.trigger_publishing_job.await_count == 2
        called_scenarios = [
            call.kwargs["scenario_id"]
            for call in mock_client.trigger_publishing_job.await_args_list
        ]
        assert "500009" in called_scenarios
        assert "500010" in called_scenarios

    async def test_locale_resolves_document_uuid(self, executor):
        """When a locale is specified, the executor must substitute locale doc UUIDs."""
        svc, mock_client = executor
        schedule = _make_schedule(
            scenario_id='["500009"]',
            locale='["fr-fr"]',
            document_ids='["doc-1"]',
        )
        db, job = _make_db(schedule)

        mock_ccms = MagicMock()
        mock_ccms.get_document_locales = AsyncMock(
            return_value=[{"code": "fr-fr", "uuid": "doc-fr-uuid"}]
        )

        with patch("services.job_executor.JobHistory") as MockJobHistory, \
             patch("services.job_executor.HerettoCcmsClient", return_value=mock_ccms):
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        # Called for the locale doc, not the original doc-1
        mock_client.trigger_publishing_job.assert_awaited_once_with(
            scenario_id="500009",
            deployment_id="dep-1",
            document_ids=["doc-fr-uuid"],
            parameters=[],
        )

    async def test_unknown_locale_falls_back_to_source_doc(self, executor):
        """If locale UUID not found, source doc ID is used as fallback."""
        svc, mock_client = executor
        schedule = _make_schedule(
            scenario_id='["500009"]',
            locale='["ja-jp"]',  # doc has no Japanese locale
            document_ids='["doc-1"]',
        )
        db, job = _make_db(schedule)

        mock_ccms = MagicMock()
        mock_ccms.get_document_locales = AsyncMock(
            return_value=[{"code": "fr-fr", "uuid": "doc-fr-uuid"}]  # only French
        )

        with patch("services.job_executor.JobHistory") as MockJobHistory, \
             patch("services.job_executor.HerettoCcmsClient", return_value=mock_ccms):
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        mock_client.trigger_publishing_job.assert_awaited_once_with(
            scenario_id="500009",
            deployment_id="dep-1",
            document_ids=["doc-1"],  # fallback to source
            parameters=[],
        )

    async def test_scenario_x_locale_cartesian_product(self, executor):
        """2 scenarios × 2 locales = 4 publish calls."""
        svc, mock_client = executor
        mock_client.trigger_publishing_job = AsyncMock(return_value=[
            {"id": "j", "status": "submitted", "fileId": "doc-1"}
        ])
        schedule = _make_schedule(
            scenario_id='["500009", "500010"]',
            locale='["fr-fr", "de-de"]',
            document_ids='["doc-1"]',
        )
        db, job = _make_db(schedule)

        mock_ccms = MagicMock()
        mock_ccms.get_document_locales = AsyncMock(return_value=[
            {"code": "fr-fr", "uuid": "doc-fr"},
            {"code": "de-de", "uuid": "doc-de"},
        ])

        with patch("services.job_executor.JobHistory") as MockJobHistory, \
             patch("services.job_executor.HerettoCcmsClient", return_value=mock_ccms):
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        assert mock_client.trigger_publishing_job.await_count == 4

    async def test_job_status_completed_on_success(self, executor):
        svc, mock_client = executor
        schedule = _make_schedule()
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        assert job.status == "completed"

    async def test_job_status_failed_on_publish_error(self, executor):
        svc, mock_client = executor
        mock_client.trigger_publishing_job = AsyncMock(side_effect=RuntimeError("API down"))
        schedule = _make_schedule()
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        assert job.status == "failed"

    async def test_consecutive_failures_incremented(self, executor):
        svc, mock_client = executor
        mock_client.trigger_publishing_job = AsyncMock(side_effect=RuntimeError("fail"))
        schedule = _make_schedule(consecutive_failures=2)
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        assert schedule.consecutive_failures == 3

    async def test_auto_disable_after_max_consecutive_failures(self, executor, mock_settings):
        svc, mock_client = executor
        mock_settings.scheduler_max_consecutive_failures = 3
        mock_client.trigger_publishing_job = AsyncMock(side_effect=RuntimeError("fail"))
        # Already at 2 failures; this run pushes it to 3 → auto-disable
        schedule = _make_schedule(consecutive_failures=2)
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        assert schedule.enabled is False

    async def test_schedule_not_disabled_below_threshold(self, executor, mock_settings):
        svc, mock_client = executor
        mock_settings.scheduler_max_consecutive_failures = 5
        mock_client.trigger_publishing_job = AsyncMock(side_effect=RuntimeError("fail"))
        schedule = _make_schedule(consecutive_failures=1)
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        assert schedule.enabled is True  # not yet at threshold

    async def test_running_set_cleared_after_completion(self, executor):
        svc, mock_client = executor
        schedule = _make_schedule()
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        assert not svc.is_running("sched-1")

    async def test_running_set_cleared_after_failure(self, executor):
        svc, mock_client = executor
        mock_client.trigger_publishing_job = AsyncMock(side_effect=RuntimeError("fail"))
        schedule = _make_schedule()
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        assert not svc.is_running("sched-1")

    async def test_legacy_bare_scenario_id_handled(self, executor):
        """Schedules created before multi-select store a plain string, not JSON."""
        svc, mock_client = executor
        schedule = _make_schedule(scenario_id="500009")  # legacy format
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        mock_client.trigger_publishing_job.assert_awaited_once()
        assert mock_client.trigger_publishing_job.call_args.kwargs["scenario_id"] == "500009"


@pytest.mark.asyncio
class TestFolderResolution:
    """Folder IDs are resolved to their current direct-child DITA maps at run time."""

    async def test_folder_maps_published(self, executor):
        """Maps resolved from a folder are passed to the publish call."""
        svc, mock_client = executor
        schedule = _make_schedule(
            document_ids="[]",
            folder_ids='["folder-1"]',
        )
        db, job = _make_db(schedule)

        mock_ccms = MagicMock()
        mock_ccms.get_ditamaps_in_folder = AsyncMock(
            return_value=[{"id": "map-from-folder", "title": "Map", "name": "map.ditamap"}]
        )

        with patch("services.job_executor.JobHistory") as MockJobHistory, \
             patch("services.job_executor.HerettoCcmsClient", return_value=mock_ccms):
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        called_ids = mock_client.trigger_publishing_job.call_args.kwargs["document_ids"]
        assert "map-from-folder" in called_ids

    async def test_folder_maps_merged_with_explicit_docs(self, executor):
        """Explicit document_ids and folder-resolved maps are merged."""
        svc, mock_client = executor
        schedule = _make_schedule(
            document_ids='["explicit-doc"]',
            folder_ids='["folder-1"]',
        )
        db, job = _make_db(schedule)

        mock_ccms = MagicMock()
        mock_ccms.get_ditamaps_in_folder = AsyncMock(
            return_value=[{"id": "folder-map", "title": "FM", "name": "fm.ditamap"}]
        )

        with patch("services.job_executor.JobHistory") as MockJobHistory, \
             patch("services.job_executor.HerettoCcmsClient", return_value=mock_ccms):
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        called_ids = mock_client.trigger_publishing_job.call_args.kwargs["document_ids"]
        assert "explicit-doc" in called_ids
        assert "folder-map" in called_ids

    async def test_duplicate_map_deduped(self, executor):
        """A map appearing in both document_ids and a folder is published only once."""
        svc, mock_client = executor
        schedule = _make_schedule(
            document_ids='["shared-map"]',
            folder_ids='["folder-1"]',
        )
        db, job = _make_db(schedule)

        mock_ccms = MagicMock()
        mock_ccms.get_ditamaps_in_folder = AsyncMock(
            return_value=[{"id": "shared-map", "title": "S", "name": "s.ditamap"}]
        )

        with patch("services.job_executor.JobHistory") as MockJobHistory, \
             patch("services.job_executor.HerettoCcmsClient", return_value=mock_ccms):
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        called_ids = mock_client.trigger_publishing_job.call_args.kwargs["document_ids"]
        assert called_ids.count("shared-map") == 1

    async def test_empty_folder_ids_skips_ccms_call(self, executor):
        """When folder_ids is empty, no CCMS folder resolution call is made."""
        svc, mock_client = executor
        schedule = _make_schedule(document_ids='["doc-1"]', folder_ids="[]")
        db, job = _make_db(schedule)

        mock_ccms = MagicMock()
        mock_ccms.get_ditamaps_in_folder = AsyncMock(return_value=[])

        with patch("services.job_executor.JobHistory") as MockJobHistory, \
             patch("services.job_executor.HerettoCcmsClient", return_value=mock_ccms):
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        mock_ccms.get_ditamaps_in_folder.assert_not_awaited()

    async def test_folder_resolution_failure_does_not_abort_job(self, executor):
        """A folder lookup error is logged and swallowed; the job continues."""
        svc, mock_client = executor
        schedule = _make_schedule(document_ids='["doc-1"]', folder_ids='["folder-bad"]')
        db, job = _make_db(schedule)

        mock_ccms = MagicMock()
        mock_ccms.get_ditamaps_in_folder = AsyncMock(side_effect=RuntimeError("CCMS down"))

        with patch("services.job_executor.JobHistory") as MockJobHistory, \
             patch("services.job_executor.HerettoCcmsClient", return_value=mock_ccms):
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        # Job should still publish the explicit doc despite folder error
        mock_client.trigger_publishing_job.assert_awaited_once()
        called_ids = mock_client.trigger_publishing_job.call_args.kwargs["document_ids"]
        assert called_ids == ["doc-1"]


@pytest.mark.asyncio
class TestReleasePinning:
    """document_releases swaps map IDs for snapshot file UUIDs before publishing."""

    async def test_pinned_release_replaces_source_doc_id(self, executor):
        """When a release is pinned, its snapshot UUID is used instead of the map UUID."""
        svc, mock_client = executor
        schedule = _make_schedule(
            document_ids='["map-1"]',
            document_releases='{"map-1": "snapshot-uuid-1"}',
        )
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        called_ids = mock_client.trigger_publishing_job.call_args.kwargs["document_ids"]
        assert called_ids == ["snapshot-uuid-1"]

    async def test_unpinned_map_uses_original_id(self, executor):
        """A map with no pinned release keeps its original UUID."""
        svc, mock_client = executor
        schedule = _make_schedule(
            document_ids='["map-1", "map-2"]',
            document_releases='{"map-1": "snapshot-uuid-1"}',
        )
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        called_ids = mock_client.trigger_publishing_job.call_args.kwargs["document_ids"]
        assert called_ids == ["snapshot-uuid-1", "map-2"]

    async def test_empty_document_releases_no_swap(self, executor):
        """When document_releases is empty no substitution occurs."""
        svc, mock_client = executor
        schedule = _make_schedule(
            document_ids='["map-1"]',
            document_releases="{}",
        )
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        called_ids = mock_client.trigger_publishing_job.call_args.kwargs["document_ids"]
        assert called_ids == ["map-1"]

    async def test_release_applied_to_locale_docs(self, executor):
        """Release substitution is applied after locale resolution."""
        svc, mock_client = executor
        schedule = _make_schedule(
            document_ids='["map-1"]',
            locale='["fr-fr"]',
            document_releases='{"fr-map-uuid": "snapshot-fr-uuid"}',
        )
        db, job = _make_db(schedule)

        mock_ccms = MagicMock()
        mock_ccms.get_document_locales = AsyncMock(
            return_value=[{"code": "fr-fr", "uuid": "fr-map-uuid"}]
        )

        with patch("services.job_executor.JobHistory") as MockJobHistory, \
             patch("services.job_executor.HerettoCcmsClient", return_value=mock_ccms):
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        # Locale resolved map-1 → fr-map-uuid, then release swapped → snapshot-fr-uuid
        called_ids = mock_client.trigger_publishing_job.call_args.kwargs["document_ids"]
        assert called_ids == ["snapshot-fr-uuid"]

    async def test_release_included_in_request_payload(self, executor):
        """document_releases map is captured in the job's request_payload."""
        svc, mock_client = executor
        schedule = _make_schedule(
            document_ids='["map-1"]',
            document_releases='{"map-1": "snapshot-uuid-1"}',
        )
        db, job = _make_db(schedule)

        with patch("services.job_executor.JobHistory") as MockJobHistory:
            MockJobHistory.return_value = job
            await svc.execute("sched-1", db)

        # The request_payload is set via the JobHistory constructor kwargs
        raw = MockJobHistory.call_args.kwargs["request_payload"]
        payload = json.loads(raw)
        assert payload["documentReleases"] == {"map-1": "snapshot-uuid-1"}
