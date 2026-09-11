"""Tests for the delivery poller — _safe_filename, _download_bundle, _process_row."""

import os
import pytest
import respx
import httpx
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch, mock_open


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_target(type_="sftp", enabled=True, config_encrypted=b"encrypted"):
    t = MagicMock()
    t.type = type_
    t.enabled = enabled
    t.config_encrypted = config_encrypted
    return t


def _make_row(
    status="pending",
    attempts=0,
    file_id="file-1",
    publish_id="pub-1",
    document_name="My Guide",
    target=None,
):
    job = MagicMock()
    schedule = MagicMock()
    schedule.delivery_target = target if target is not None else _make_target()
    job.schedule = schedule
    job.id = "job-1"

    row = MagicMock()
    row.id = "row-1"
    row.status = status
    row.attempts = attempts
    row.file_id = file_id
    row.publish_id = publish_id
    row.document_name = document_name
    row.job_history = job
    return row


# ── _safe_filename ─────────────────────────────────────────────────────────────

class TestSafeFilename:
    def test_safe_name_unchanged(self):
        from services.delivery_poller import _safe_filename
        result = _safe_filename("my-guide")
        assert result.startswith("my-guide_")
        assert result.endswith(".zip")

    def test_spaces_replaced_with_underscores(self):
        from services.delivery_poller import _safe_filename
        result = _safe_filename("My Guide Document")
        assert "My_Guide_Document" in result

    def test_special_chars_replaced(self):
        from services.delivery_poller import _safe_filename
        result = _safe_filename("doc/v1.2 (final)!")
        assert "/" not in result
        assert "(" not in result
        assert "!" not in result

    def test_empty_name_falls_back_to_bundle(self):
        from services.delivery_poller import _safe_filename
        result = _safe_filename("")
        assert result.startswith("bundle_")

    def test_result_ends_with_zip(self):
        from services.delivery_poller import _safe_filename
        result = _safe_filename("doc")
        assert result.endswith(".zip")

    def test_timestamp_present_in_result(self):
        from services.delivery_poller import _safe_filename
        import re
        result = _safe_filename("doc")
        # Timestamp suffix is YYYYMMDDTHHMMSSz format
        assert re.search(r"\d{8}T\d{6}Z\.zip$", result)


# ── _download_bundle ───────────────────────────────────────────────────────────

BASE_URL = "https://test.heretto.com/ezdnxtgen/api/v2"


@pytest.mark.asyncio
class TestDownloadBundle:
    async def test_200_writes_file_and_returns_true(self, mock_settings, tmp_path):
        from services.delivery_poller import _download_bundle

        dest = str(tmp_path / "out.zip")
        url = f"{BASE_URL}/files/file-1/publishes/pub-1/assets-all"

        with respx.mock:
            respx.get(url).mock(return_value=httpx.Response(200, content=b"zip-data"))
            result = await _download_bundle("file-1", "pub-1", dest)

        assert result is True
        assert open(dest, "rb").read() == b"zip-data"

    async def test_404_returns_false(self, mock_settings):
        from services.delivery_poller import _download_bundle

        url = f"{BASE_URL}/files/file-1/publishes/pub-1/assets-all"

        with respx.mock:
            respx.get(url).mock(return_value=httpx.Response(404))
            result = await _download_bundle("file-1", "pub-1", "/tmp/out.zip")

        assert result is False

    async def test_400_returns_false(self, mock_settings):
        from services.delivery_poller import _download_bundle

        url = f"{BASE_URL}/files/file-1/publishes/pub-1/assets-all"

        with respx.mock:
            respx.get(url).mock(return_value=httpx.Response(400))
            result = await _download_bundle("file-1", "pub-1", "/tmp/out.zip")

        assert result is False


# ── _process_row ───────────────────────────────────────────────────────────────

@pytest.mark.asyncio
class TestProcessRow:
    async def test_no_target_marks_failed(self, mock_settings):
        from services.delivery_poller import _process_row
        row = _make_row()
        row.job_history.schedule.delivery_target = None
        db = MagicMock()

        await _process_row(row, db, max_attempts=60)

        assert row.status == "failed"
        assert "No active delivery target" in row.error
        db.commit.assert_called()

    async def test_disabled_target_marks_failed(self, mock_settings):
        from services.delivery_poller import _process_row
        row = _make_row(target=_make_target(enabled=False))
        db = MagicMock()

        await _process_row(row, db, max_attempts=60)

        assert row.status == "failed"
        db.commit.assert_called()

    async def test_max_attempts_marks_failed(self, mock_settings):
        from services.delivery_poller import _process_row
        row = _make_row(attempts=59)  # one below max; incrementing hits 60 == max
        db = MagicMock()

        with patch("services.delivery_poller._download_bundle", new_callable=AsyncMock) as mock_dl:
            await _process_row(row, db, max_attempts=60)

        assert row.status == "failed"
        assert "max poll attempts" in row.error
        mock_dl.assert_not_awaited()

    async def test_bundle_not_ready_increments_attempts_and_keeps_pending(self, mock_settings):
        from services.delivery_poller import _process_row
        row = _make_row(attempts=0)
        db = MagicMock()

        with patch("services.delivery_poller._download_bundle", new_callable=AsyncMock, return_value=False), \
             patch("services.delivery_poller.tempfile.mkstemp", return_value=(99, "/tmp/x.zip")), \
             patch("services.delivery_poller.os.close"), \
             patch("services.delivery_poller.os.unlink"), \
             patch("services.delivery_poller.decrypt_credentials", return_value={}):
            await _process_row(row, db, max_attempts=60)

        assert row.attempts == 1
        assert row.status == "pending"  # unchanged from initial
        db.commit.assert_called()

    async def test_successful_delivery_marks_completed(self, mock_settings):
        from services.delivery_poller import _process_row
        row = _make_row(attempts=0)
        db = MagicMock()

        mock_client = AsyncMock()

        with patch("services.delivery_poller._download_bundle", new_callable=AsyncMock, return_value=True), \
             patch("services.delivery_poller._make_delivery_client", return_value=mock_client), \
             patch("services.delivery_poller.tempfile.mkstemp", return_value=(99, "/tmp/x.zip")), \
             patch("services.delivery_poller.os.close"), \
             patch("services.delivery_poller.os.unlink"):
            await _process_row(row, db, max_attempts=60)

        assert row.status == "completed"
        assert row.delivered_at is not None
        mock_client.deliver.assert_awaited_once()

    async def test_delivery_error_marks_failed_with_message(self, mock_settings):
        from services.delivery_poller import _process_row
        row = _make_row(attempts=0)
        db = MagicMock()

        mock_client = AsyncMock()
        mock_client.deliver.side_effect = OSError("connection refused")

        with patch("services.delivery_poller._download_bundle", new_callable=AsyncMock, return_value=True), \
             patch("services.delivery_poller._make_delivery_client", return_value=mock_client), \
             patch("services.delivery_poller.tempfile.mkstemp", return_value=(99, "/tmp/x.zip")), \
             patch("services.delivery_poller.os.close"), \
             patch("services.delivery_poller.os.unlink"):
            await _process_row(row, db, max_attempts=60)

        assert row.status == "failed"
        assert "connection refused" in row.error

    async def test_temp_file_deleted_after_success(self, mock_settings):
        from services.delivery_poller import _process_row
        row = _make_row(attempts=0)
        db = MagicMock()

        mock_client = AsyncMock()

        with patch("services.delivery_poller._download_bundle", new_callable=AsyncMock, return_value=True), \
             patch("services.delivery_poller._make_delivery_client", return_value=mock_client), \
             patch("services.delivery_poller.tempfile.mkstemp", return_value=(99, "/tmp/x.zip")), \
             patch("services.delivery_poller.os.close"), \
             patch("services.delivery_poller.os.unlink") as mock_unlink:
            await _process_row(row, db, max_attempts=60)

        mock_unlink.assert_called_once_with("/tmp/x.zip")

    async def test_temp_file_deleted_after_failure(self, mock_settings):
        from services.delivery_poller import _process_row
        row = _make_row(attempts=0)
        db = MagicMock()

        mock_client = AsyncMock()
        mock_client.deliver.side_effect = RuntimeError("upload failed")

        with patch("services.delivery_poller._download_bundle", new_callable=AsyncMock, return_value=True), \
             patch("services.delivery_poller._make_delivery_client", return_value=mock_client), \
             patch("services.delivery_poller.tempfile.mkstemp", return_value=(99, "/tmp/x.zip")), \
             patch("services.delivery_poller.os.close"), \
             patch("services.delivery_poller.os.unlink") as mock_unlink:
            await _process_row(row, db, max_attempts=60)

        mock_unlink.assert_called_once_with("/tmp/x.zip")

    async def test_filename_uses_document_name(self, mock_settings):
        from services.delivery_poller import _process_row
        row = _make_row(attempts=0, document_name="Install Guide")
        db = MagicMock()

        mock_client = AsyncMock()
        delivered_filename = None

        async def capture_deliver(filename, path):
            nonlocal delivered_filename
            delivered_filename = filename

        mock_client.deliver.side_effect = capture_deliver

        with patch("services.delivery_poller._download_bundle", new_callable=AsyncMock, return_value=True), \
             patch("services.delivery_poller._make_delivery_client", return_value=mock_client), \
             patch("services.delivery_poller.tempfile.mkstemp", return_value=(99, "/tmp/x.zip")), \
             patch("services.delivery_poller.os.close"), \
             patch("services.delivery_poller.os.unlink"):
            await _process_row(row, db, max_attempts=60)

        assert delivered_filename is not None
        assert "Install_Guide" in delivered_filename


# ── _make_delivery_client ──────────────────────────────────────────────────────

class TestMakeDeliveryClient:
    def test_sftp_type_returns_sftp_client(self):
        from services.delivery_poller import _make_delivery_client
        from clients.sftp_delivery import SFTPDeliveryClient

        target = _make_target(type_="sftp")
        config = {"host": "h", "username": "u", "password": "p", "port": 22, "remote_path": "/"}

        with patch("services.delivery_poller.decrypt_credentials", return_value=config):
            client = _make_delivery_client(target)

        assert isinstance(client, SFTPDeliveryClient)

    def test_s3_type_returns_s3_client(self):
        from services.delivery_poller import _make_delivery_client
        from clients.s3_delivery import S3DeliveryClient

        target = _make_target(type_="s3")
        config = {
            "bucket": "b", "region": "us-east-1",
            "access_key_id": "K", "secret_access_key": "S",
        }

        with patch("services.delivery_poller.decrypt_credentials", return_value=config):
            client = _make_delivery_client(target)

        assert isinstance(client, S3DeliveryClient)

    def test_unknown_type_raises(self):
        from services.delivery_poller import _make_delivery_client

        target = _make_target(type_="ftp")

        with patch("services.delivery_poller.decrypt_credentials", return_value={}):
            with pytest.raises(ValueError, match="Unknown delivery target type"):
                _make_delivery_client(target)


# ── DeliveryPollerService._tick ────────────────────────────────────────────────

@pytest.mark.asyncio
class TestDeliveryPollerTick:
    async def test_tick_processes_pending_rows(self, mock_settings):
        from services.delivery_poller import DeliveryPollerService

        row1 = _make_row(status="pending")
        row2 = _make_row(status="delivering")
        db = MagicMock()
        db.query.return_value.filter.return_value.filter.return_value.all.return_value = [row1, row2]

        with patch("services.delivery_poller._process_row", new_callable=AsyncMock) as mock_proc:
            await DeliveryPollerService()._tick(db, max_attempts=60)

        assert mock_proc.await_count == 2

    async def test_tick_does_nothing_when_no_rows(self, mock_settings):
        from services.delivery_poller import DeliveryPollerService

        db = MagicMock()
        db.query.return_value.filter.return_value.filter.return_value.all.return_value = []

        with patch("services.delivery_poller._process_row", new_callable=AsyncMock) as mock_proc:
            await DeliveryPollerService()._tick(db, max_attempts=60)

        mock_proc.assert_not_awaited()

    async def test_tick_continues_after_row_error(self, mock_settings):
        """An exception in _process_row for one row must not stop the remaining rows."""
        from services.delivery_poller import DeliveryPollerService

        row1 = _make_row(status="pending")
        row2 = _make_row(status="pending")
        db = MagicMock()
        db.query.return_value.filter.return_value.filter.return_value.all.return_value = [row1, row2]

        call_count = 0

        async def flaky_process(row, db_, max_attempts):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError("unexpected error")

        with patch("services.delivery_poller._process_row", side_effect=flaky_process):
            await DeliveryPollerService()._tick(db, max_attempts=60)

        assert call_count == 2
