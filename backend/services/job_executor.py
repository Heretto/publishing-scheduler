"""Job executor — runs a Heretto publishing job for a schedule."""

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from clients.heretto import HerettoClient
from clients.heretto_ccms import HerettoCcmsClient
from models import JobHistory, Schedule
from settings import get_settings

logger = logging.getLogger(__name__)


async def _retry(coro_fn, max_attempts: int, initial_delay_ms: int, max_delay_ms: int, multiplier: float):
    delay = initial_delay_ms / 1000
    for attempt in range(1, max_attempts + 1):
        try:
            return await coro_fn()
        except Exception as exc:
            if attempt == max_attempts:
                raise
            logger.warning("Retrying after error (attempt %d/%d): %s", attempt, max_attempts, exc)
            await asyncio.sleep(min(delay, max_delay_ms / 1000))
            delay *= multiplier


class JobExecutorService:
    """Executes Heretto publishing jobs with concurrency guard and retry."""

    def __init__(self):
        self._running: set[str] = set()  # schedule IDs currently executing
        self._client = HerettoClient()

    def is_running(self, schedule_id: str) -> bool:
        return schedule_id in self._running

    def running_count(self) -> int:
        return len(self._running)

    async def execute(
        self,
        schedule_id: str,
        db: Session,
        trigger_type: str = "scheduled",
    ) -> dict:
        if schedule_id in self._running:
            raise RuntimeError(f"Job for schedule {schedule_id} is already running")

        schedule: Schedule | None = db.query(Schedule).filter(Schedule.id == schedule_id).first()
        if not schedule:
            raise ValueError(f"Schedule {schedule_id} not found")

        self._running.add(schedule_id)
        s = get_settings()

        doc_ids: list[str] = json.loads(schedule.document_ids or "[]")
        params: list[dict] = json.loads(schedule.publish_parameters or "[]")

        # Resolve locale UUIDs — swap each source doc with its localised counterpart
        locale = getattr(schedule, "locale", "") or ""
        if locale and doc_ids:
            ccms = HerettoCcmsClient()
            resolved: list[str] = []
            for doc_id in doc_ids:
                locales = await ccms.get_document_locales(doc_id)
                locale_map = {l["code"]: l["uuid"] for l in locales}
                resolved.append(locale_map.get(locale, doc_id))
            doc_ids = resolved

        request_payload = {
            "scenarioId": schedule.scenario_id,
            "deploymentId": schedule.deployment_id,
            "documentIds": doc_ids,
            "parameters": params,
            **({"locale": locale} if locale else {}),
        }

        job = JobHistory(
            schedule_id=schedule_id,
            trigger_type=trigger_type,
            status="running",
            request_payload=json.dumps(request_payload),
        )
        db.add(job)
        db.commit()
        db.refresh(job)

        try:
            results = await _retry(
                lambda: self._client.trigger_publishing_job(
                    scenario_id=schedule.scenario_id,
                    deployment_id=schedule.deployment_id,
                    document_ids=doc_ids,
                    parameters=params,
                ),
                max_attempts=s.retry_max_attempts,
                initial_delay_ms=s.retry_initial_delay_ms,
                max_delay_ms=s.retry_max_delay_ms,
                multiplier=s.retry_backoff_multiplier,
            )

            job.status = "completed"
            job.completed_at = datetime.now(timezone.utc)
            job.heretto_job_id = ",".join(r["id"] for r in results)
            job.response_payload = json.dumps(results)

            schedule.last_run_at = datetime.now(timezone.utc)
            schedule.last_run_status = "success"
            schedule.consecutive_failures = 0

            db.commit()
            logger.info("Job completed: %s (schedule=%s)", job.id, schedule_id)
            return self._format_job(job)

        except Exception as exc:
            error_msg = str(exc)

            job.status = "failed"
            job.completed_at = datetime.now(timezone.utc)
            job.error = error_msg

            schedule.last_run_at = datetime.now(timezone.utc)
            schedule.last_run_status = "failed"
            schedule.consecutive_failures = (schedule.consecutive_failures or 0) + 1

            # Auto-disable after too many consecutive failures
            if schedule.consecutive_failures >= s.scheduler_max_consecutive_failures:
                schedule.enabled = False
                logger.error(
                    "Auto-disabling schedule %s after %d consecutive failures",
                    schedule_id,
                    schedule.consecutive_failures,
                )

            db.commit()
            logger.error("Job failed: %s (schedule=%s): %s", job.id, schedule_id, error_msg)
            return self._format_job(job)

        finally:
            self._running.discard(schedule_id)

    @staticmethod
    def _format_job(job: JobHistory) -> dict:
        return {
            "id": job.id,
            "schedule_id": job.schedule_id,
            "status": job.status,
            "trigger_type": job.trigger_type,
            "started_at": job.started_at.isoformat() if job.started_at else None,
            "completed_at": job.completed_at.isoformat() if job.completed_at else None,
            "heretto_job_id": job.heretto_job_id,
            "request_payload": json.loads(job.request_payload or "{}"),
            "response_payload": json.loads(job.response_payload or "{}"),
            "error": job.error,
        }
