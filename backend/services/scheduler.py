"""APScheduler-based cron scheduler for publishing schedules."""

import asyncio
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

# Module-level singleton
_scheduler = AsyncIOScheduler()


def get_scheduler() -> AsyncIOScheduler:
    return _scheduler


def start():
    if not _scheduler.running:
        _scheduler.start()
        logger.info("APScheduler started")


def shutdown(wait: bool = True):
    if _scheduler.running:
        _scheduler.shutdown(wait=wait)
        logger.info("APScheduler shut down")


def load_all(schedules: list, run_job_fn) -> int:
    """Load all enabled schedules from the DB into the scheduler."""
    # Clear existing jobs
    _scheduler.remove_all_jobs()
    count = 0
    for schedule in schedules:
        if schedule.enabled:
            _add_job(schedule.id, schedule.cron_expression, run_job_fn)
            count += 1
    logger.info("Scheduler loaded %d active schedule(s)", count)
    return count


def add_schedule(schedule_id: str, cron_expression: str, run_job_fn) -> bool:
    remove_schedule(schedule_id)
    return _add_job(schedule_id, cron_expression, run_job_fn)


def remove_schedule(schedule_id: str) -> None:
    job_id = f"schedule:{schedule_id}"
    if _scheduler.get_job(job_id):
        _scheduler.remove_job(job_id)


def is_active(schedule_id: str) -> bool:
    return _scheduler.get_job(f"schedule:{schedule_id}") is not None


def active_count() -> int:
    return len(_scheduler.get_jobs())


def _add_job(schedule_id: str, cron_expression: str, run_job_fn) -> bool:
    try:
        trigger = CronTrigger.from_crontab(cron_expression)
    except Exception as exc:
        logger.error("Invalid cron expression for schedule %s: %s", schedule_id, exc)
        return False

    _scheduler.add_job(
        run_job_fn,
        trigger=trigger,
        id=f"schedule:{schedule_id}",
        args=[schedule_id],
        replace_existing=True,
        misfire_grace_time=60,
    )
    return True
