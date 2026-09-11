"""Delivery poller — probes Heretto for completed publish bundles and delivers them.

For each PendingDelivery row the poller:
  1. Calls GET /files/{fileId}/publishes/{publishId}/assets-all on the Heretto API.
  2. If the job is complete (HTTP 200) it streams the ZIP to a temp file.
  3. Instantiates the correct delivery client (SFTP or S3) and delivers the file.
  4. Updates the row status accordingly.

4xx responses mean the job is not yet done — the row is retried on the next tick.
After delivery_max_poll_attempts the row is marked failed to prevent infinite polling
on a permanently failed Heretto job.
"""

import asyncio
import logging
import os
import re
import tempfile
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from hop_core.core.security import decrypt_credentials
from models import DeliveryTarget, JobHistory, PendingDelivery, Schedule
from settings import get_settings

logger = logging.getLogger(__name__)

_UNSAFE_FILENAME_RE = re.compile(r"[^\w\-]")


def _safe_filename(document_name: str) -> str:
    """Return a filesystem-safe ZIP filename for the given document name."""
    stem = _UNSAFE_FILENAME_RE.sub("_", document_name).strip("_") or "bundle"
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{stem}_{ts}.zip"


async def _download_bundle(file_id: str, publish_id: str, dest_path: str) -> bool:
    """Stream the Heretto bundle ZIP to *dest_path*.

    Returns True if the bundle was available and written successfully.
    Returns False if the job is not yet complete (4xx response).
    Raises on network errors or unexpected 5xx responses.
    """
    s = get_settings()
    url = f"{s.heretto_api_base_url}/files/{file_id}/publishes/{publish_id}/assets-all"
    timeout = httpx.Timeout(connect=10.0, read=300.0, write=60.0, pool=5.0)

    async with httpx.AsyncClient(
        auth=(s.heretto_username, s.heretto_password),
        timeout=timeout,
    ) as client:
        async with client.stream("GET", url) as response:
            if response.status_code == 200:
                with open(dest_path, "wb") as fh:
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        fh.write(chunk)
                return True
            if 400 <= response.status_code < 500:
                logger.debug(
                    "Bundle not ready for publish %s (HTTP %d)",
                    publish_id, response.status_code,
                )
                return False
            response.raise_for_status()

    return False  # unreachable; satisfies type checkers


def _make_delivery_client(target: DeliveryTarget):
    """Return the appropriate delivery client for *target*."""
    config = decrypt_credentials(target.config_encrypted)
    if target.type == "sftp":
        from clients.sftp_delivery import SFTPDeliveryClient
        return SFTPDeliveryClient(config)
    if target.type == "s3":
        from clients.s3_delivery import S3DeliveryClient
        return S3DeliveryClient(config)
    raise ValueError(f"Unknown delivery target type: {target.type!r}")


async def _process_row(row: PendingDelivery, db: Session, max_attempts: int) -> None:
    """Handle one PendingDelivery row in a single poller tick."""
    job: JobHistory = row.job_history
    schedule: Schedule = job.schedule
    target: DeliveryTarget | None = schedule.delivery_target

    if not target or not target.enabled:
        row.status = "failed"
        row.error = "No active delivery target on schedule"
        db.commit()
        return

    row.attempts += 1
    row.last_polled_at = datetime.now(timezone.utc)

    if row.attempts >= max_attempts:
        row.status = "failed"
        row.error = f"Exceeded max poll attempts ({max_attempts})"
        db.commit()
        logger.warning(
            "PendingDelivery %s failed: max attempts reached (publish=%s)",
            row.id, row.publish_id,
        )
        return

    # Create a temp file to stream the bundle into before delivery.
    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".zip")
    os.close(tmp_fd)
    try:
        ready = await _download_bundle(row.file_id, row.publish_id, tmp_path)
        if not ready:
            db.commit()  # persist incremented attempt count
            return

        row.status = "delivering"
        db.commit()

        client = _make_delivery_client(target)
        filename = _safe_filename(row.document_name or row.publish_id)
        await client.deliver(filename, tmp_path)

        row.status = "completed"
        row.delivered_at = datetime.now(timezone.utc)
        db.commit()
        logger.info(
            "PendingDelivery %s: delivered publish %s as %s via %s",
            row.id, row.publish_id, filename, target.type,
        )

    except Exception as exc:
        row.status = "failed"
        row.error = str(exc) or type(exc).__name__
        db.commit()
        logger.error(
            "PendingDelivery %s failed (publish=%s): %s",
            row.id, row.publish_id, exc,
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


class DeliveryPollerService:
    """Background service that polls pending bundle deliveries on a fixed interval."""

    async def run(self, session_factory) -> None:
        s = get_settings()
        logger.info(
            "Delivery poller started (interval=%ds, max_attempts=%d)",
            s.delivery_poll_interval_seconds,
            s.delivery_max_poll_attempts,
        )
        while True:
            await asyncio.sleep(s.delivery_poll_interval_seconds)
            db: Session = session_factory()
            try:
                await self._tick(db, s.delivery_max_poll_attempts)
            except Exception:
                logger.exception("Delivery poller tick error")
            finally:
                db.close()

    async def _tick(self, db: Session, max_attempts: int) -> None:
        rows = (
            db.query(PendingDelivery)
            .filter(PendingDelivery.status.in_(["pending", "delivering"]))
            .filter(PendingDelivery.attempts < max_attempts)
            .all()
        )
        if not rows:
            return
        logger.debug("Delivery poller: checking %d pending row(s)", len(rows))
        for row in rows:
            try:
                await _process_row(row, db, max_attempts)
            except Exception:
                logger.exception("Unhandled error processing PendingDelivery %s", row.id)
