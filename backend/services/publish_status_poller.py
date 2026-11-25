"""Publish status poller — keeps a job "running" until Heretto finishes its publishes.

Heretto accepting a publish request only means the publish was queued. For every
job still ``running`` that has submitted publishes, each tick:
  1. Calls GET /files/{fileId}/publishes/{publishId} for each publish not yet DONE.
  2. Records the Heretto state, result and message on that entry of ``job.publish_jobs``.
  3. Once every publish is DONE, finalises the job: ``completed`` if all succeeded,
     ``failed`` otherwise (see job_executor.finalize_job).
A job that waits longer than ``job_timeout_seconds`` is failed so it cannot stay
"running" forever.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from clients.heretto import HerettoClient
from models import JobHistory
from services.heretto_connection import NoHerettoConnection, get_heretto_connection
from services.job_executor import finalize_job
from settings import get_settings

logger = logging.getLogger(__name__)

_DONE = "DONE"


def _as_utc(dt: datetime) -> datetime:
    # SQLite hands timezone-aware columns back naive; they were stored as UTC.
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _failure_message(entry: dict) -> str:
    name = entry.get("documentName") or entry.get("publishId")
    return f"{name}: {entry.get('message') or 'publish failed in Heretto'}"


async def _refresh_entries(client: HerettoClient, entries: list[dict]) -> bool:
    """Update every unfinished entry from Heretto. Returns True if any entry changed."""
    changed = False
    for entry in entries:
        if entry.get("state") == _DONE:
            continue
        try:
            status = await client.get_publish_status(entry["fileId"], entry["publishId"])
        except HTTPException as exc:
            if exc.status_code == 404:
                # Heretto no longer knows this publish; waiting will not change that.
                entry.update(state=_DONE, result="FAIL", message="Publish not found in Heretto")
                changed = True
            else:
                logger.warning("Could not read publish %s from Heretto: %s", entry["publishId"], exc.detail)
            continue
        except Exception as exc:  # network blip — try again next tick
            logger.warning("Could not read publish %s from Heretto: %s", entry["publishId"], exc)
            continue
        if status["state"] and (status["state"], status["result"]) != (entry.get("state"), entry.get("result")):
            entry.update(state=status["state"], result=status["result"], message=status["message"])
            changed = True
    return changed


async def _process_job(job: JobHistory, db: Session, timeout_seconds: int) -> None:
    entries: list[dict] = json.loads(job.publish_jobs or "[]")
    if not entries:
        return  # still being submitted by the executor
    schedule = job.schedule

    try:
        conn = get_heretto_connection(schedule.org_id, db)
    except NoHerettoConnection as exc:
        logger.warning("Job %s: cannot poll Heretto yet: %s", job.id, exc)
        return

    changed = await _refresh_entries(HerettoClient(conn), entries)
    if changed:
        job.publish_jobs = json.dumps(entries)

    submit_errors = json.loads(job.response_payload or "{}").get("errors", [])
    if all(e.get("state") == _DONE for e in entries):
        problems = list(submit_errors) + [_failure_message(e) for e in entries if e.get("result") != "SUCCESS"]
        finalize_job(job, schedule, db, error="; ".join(problems) or None)
        return

    started = _as_utc(job.started_at) if job.started_at else None
    if started and (datetime.now(timezone.utc) - started).total_seconds() > timeout_seconds:
        waiting = [e["documentName"] for e in entries if e.get("state") != _DONE]
        finalize_job(
            job, schedule, db,
            error=f"Timed out after {timeout_seconds}s waiting for Heretto to finish: {', '.join(waiting)}",
        )
        return

    if changed:
        db.commit()


class PublishStatusPoller:
    """Background service that follows running jobs to their real outcome in Heretto."""

    async def run(self, session_factory) -> None:
        s = get_settings()
        logger.info("Publish status poller started (interval=%ds)", s.publish_status_poll_interval_seconds)
        while True:
            await asyncio.sleep(s.publish_status_poll_interval_seconds)
            db: Session = session_factory()
            try:
                await self.tick(db, s.job_timeout_seconds)
            except Exception:
                logger.exception("Publish status poller tick error")
            finally:
                db.close()

    async def tick(self, db: Session, timeout_seconds: int) -> None:
        jobs = db.query(JobHistory).filter(JobHistory.status == "running").all()
        for job in jobs:
            try:
                await _process_job(job, db, timeout_seconds)
            except Exception:
                db.rollback()
                logger.exception("Unhandled error polling job %s", job.id)
