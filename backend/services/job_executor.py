"""Job executor — runs Heretto publishing jobs for all scenario × locale combos."""

import asyncio
import json
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from clients.heretto import HerettoClient
from clients.heretto_ccms import HerettoCcmsClient
from models import JobHistory, Schedule
from settings import get_settings
from utils import parse_ids

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
    """Executes all scenario × locale publish combinations for a schedule."""

    def __init__(self):
        self._running: set[str] = set()
        self._client = HerettoClient()

    def is_running(self, schedule_id: str) -> bool:
        return schedule_id in self._running

    def running_count(self) -> int:
        return len(self._running)

    async def _resolve_source_docs(
        self, source_doc_ids: list[str], folder_ids: list[str]
    ) -> list[str]:
        """Append DITA maps found in each folder, deduplicate, return merged list."""
        if folder_ids:
            try:
                ccms = HerettoCcmsClient()
                for folder_id in folder_ids:
                    maps = await ccms.get_ditamaps_in_folder(folder_id)
                    source_doc_ids.extend(m["id"] for m in maps)
            except (httpx.HTTPError, httpx.TransportError, KeyError, TypeError) as exc:
                logger.warning("Could not resolve folder IDs to DITA maps: %s", exc)
        return list(dict.fromkeys(source_doc_ids))  # deduplicate, preserve order

    async def _fetch_name_maps(
        self, scenario_ids: list[str], source_doc_ids: list[str]
    ) -> tuple[dict[str, str], dict[str, str]]:
        """Best-effort fetch of scenario and document names for payload enrichment.
        Returns (scenario_name_map, document_name_map). Never raises."""
        scenario_name_map: dict[str, str] = {}
        document_name_map: dict[str, str] = {}
        try:
            all_scenarios = await self._client.get_scenarios()
            scenario_name_map = {s["id"]: s["name"] for s in all_scenarios}
        except (httpx.HTTPError, httpx.TransportError) as exc:
            logger.debug("Could not fetch scenario names for enrichment: %s", exc)
        if source_doc_ids:
            try:
                ccms = HerettoCcmsClient()
                for doc_id in source_doc_ids:
                    info = await ccms.get_document_info(doc_id)
                    if info.get("title"):
                        document_name_map[doc_id] = info["title"]
            except (httpx.HTTPError, httpx.TransportError, KeyError) as exc:
                logger.debug("Could not fetch document names for enrichment: %s", exc)
        return scenario_name_map, document_name_map

    async def _build_locale_doc_map(
        self, source_doc_ids: list[str], locales_list: list[str]
    ) -> dict[str, list[str]]:
        """Build {locale: [doc_ids]} mapping via CCMS locale resolution.
        The "" key always present for source-language documents."""
        locale_doc_map: dict[str, list[str]] = {"": source_doc_ids}
        non_source = [l for l in locales_list if l]
        if non_source and source_doc_ids:
            ccms = HerettoCcmsClient()
            for locale in non_source:
                resolved: list[str] = []
                for doc_id in source_doc_ids:
                    doc_locales = await ccms.get_document_locales(doc_id)
                    lmap = {lc["code"]: lc["uuid"] for lc in doc_locales}
                    resolved.append(lmap.get(locale, doc_id))
                locale_doc_map[locale] = resolved
        return locale_doc_map

    def _apply_release_pinning(
        self,
        locale_doc_map: dict[str, list[str]],
        document_releases: dict[str, str],
    ) -> dict[str, list[str]]:
        """Swap any map ID that has a pinned release. Returns updated map."""
        if not document_releases:
            return locale_doc_map
        return {
            locale: [document_releases.get(did, did) for did in doc_ids]
            for locale, doc_ids in locale_doc_map.items()
        }

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

        source_doc_ids: list[str] = json.loads(schedule.document_ids or "[]")
        folder_ids: list[str] = json.loads(getattr(schedule, "folder_ids", None) or "[]")
        params: list[dict] = json.loads(schedule.publish_parameters or "[]")
        scenario_ids = parse_ids(schedule.scenario_id)
        locales_list = parse_ids(getattr(schedule, "locale", "") or "")

        # Treat empty locales as source-only
        if not locales_list:
            locales_list = [""]

        source_doc_ids = await self._resolve_source_docs(source_doc_ids, folder_ids)
        scenario_name_map, document_name_map = await self._fetch_name_maps(scenario_ids, source_doc_ids)
        locale_doc_map = await self._build_locale_doc_map(source_doc_ids, locales_list)

        document_releases: dict[str, str] = json.loads(
            getattr(schedule, "document_releases", None) or "{}"
        )
        locale_doc_map = self._apply_release_pinning(locale_doc_map, document_releases)

        combos = [(sid, loc) for sid in scenario_ids for loc in locales_list]
        request_payload = {
            "scenarios": scenario_ids,
            "locales": locales_list,
            "documentIds": source_doc_ids,
            "documentReleases": document_releases,
            "parameters": params,
            "scenarioNames": scenario_name_map,
            "documentNames": document_name_map,
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

        all_results: list[dict] = []
        errors: list[str] = []

        try:
            for scenario_id, locale in combos:
                doc_ids = locale_doc_map.get(locale, source_doc_ids)
                label = f"scenario={scenario_id}, locale={locale or 'source'}"
                try:
                    results = await _retry(
                        _make_publish_fn(
                            self._client, scenario_id, schedule.deployment_id, doc_ids, params
                        ),
                        max_attempts=s.retry_max_attempts,
                        initial_delay_ms=s.retry_initial_delay_ms,
                        max_delay_ms=s.retry_max_delay_ms,
                        multiplier=s.retry_backoff_multiplier,
                    )
                    for r in results:
                        r["_scenario"] = scenario_id
                        r["_locale"] = locale or "source"
                    all_results.extend(results)
                    logger.info("Published %s", label)
                except Exception as exc:
                    err = f"{label}: {exc}"
                    errors.append(err)
                    logger.error("Publish failed — %s", err)

            if errors and not all_results:
                raise RuntimeError("; ".join(errors))

            job.status = "failed" if errors else "completed"
            job.completed_at = datetime.now(timezone.utc)
            job.heretto_job_id = ",".join(r["id"] for r in all_results if r.get("id"))
            job.response_payload = json.dumps({"results": all_results, "errors": errors})

            schedule.last_run_at = datetime.now(timezone.utc)
            schedule.last_run_status = job.status
            if job.status == "completed":
                schedule.consecutive_failures = 0
            else:
                schedule.consecutive_failures = (schedule.consecutive_failures or 0) + 1

            db.commit()
            logger.info("Job %s: %s (schedule=%s)", job.id, job.status, schedule_id)
            return self._format_job(job)

        except Exception as exc:
            error_msg = str(exc)
            job.status = "failed"
            job.completed_at = datetime.now(timezone.utc)
            job.error = error_msg

            schedule.last_run_at = datetime.now(timezone.utc)
            schedule.last_run_status = "failed"
            schedule.consecutive_failures = (schedule.consecutive_failures or 0) + 1

            if schedule.consecutive_failures >= s.scheduler_max_consecutive_failures:
                schedule.enabled = False
                logger.error(
                    "Auto-disabling schedule %s after %d consecutive failures",
                    schedule_id, schedule.consecutive_failures,
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


def _make_publish_fn(client: HerettoClient, scenario_id: str, deployment_id: str,
                     doc_ids: list[str], params: list[dict]):
    """Return a zero-arg coroutine factory for use with _retry (avoids closure pitfalls)."""
    async def _fn():
        return await client.trigger_publishing_job(
            scenario_id=scenario_id,
            deployment_id=deployment_id,
            document_ids=doc_ids,
            parameters=params,
        )
    return _fn
