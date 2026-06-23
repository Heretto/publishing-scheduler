"""Schedule CRUD routes — org-scoped, auth-protected."""

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from hop_core.api.dependencies import CurrentUserContext, get_current_active_user_with_org
from hop_core.db import get_db

from models import Schedule
from services import scheduler as sched

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schedules", tags=["schedules"])

# Shared dependency aliases
OrgCtx = Annotated[CurrentUserContext, Depends(get_current_active_user_with_org)]
DB = Annotated[Session, Depends(get_db)]


# ── helpers ────────────────────────────────────────────────────────────────────

def _parse_ids(value: str | None) -> list[str]:
    """Return a list from a stored JSON array or a legacy bare string."""
    if not value:
        return []
    v = value.strip()
    if v.startswith('['):
        try:
            return [str(x) for x in json.loads(v)]
        except json.JSONDecodeError:
            pass
    return [v]


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    name: str
    description: str = ""
    cron_expression: str
    scenario_ids: list[str]

    @field_validator("scenario_ids", mode="before")
    @classmethod
    def coerce_scenario_ids(cls, v: object) -> list[str]:
        if isinstance(v, list):
            return [str(x) for x in v]
        return v  # type: ignore[return-value]
    deployment_id: str = ""
    document_ids: list[str] = []
    folder_ids: list[str] = []
    document_releases: dict[str, str] = {}
    enabled: bool = True
    branch: str = "master"
    locales: list[str] = []
    publish_parameters: list[dict] = []


class ScheduleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    cron_expression: str | None = None
    scenario_ids: list[str] | None = None

    @field_validator("scenario_ids", mode="before")
    @classmethod
    def coerce_scenario_ids(cls, v: object) -> list[str] | None:
        if isinstance(v, list):
            return [str(x) for x in v]
        return v  # type: ignore[return-value]
    deployment_id: str | None = None
    document_ids: list[str] | None = None
    folder_ids: list[str] | None = None
    document_releases: dict[str, str] | None = None
    enabled: bool | None = None
    branch: str | None = None
    locales: list[str] | None = None
    publish_parameters: list[dict] | None = None


class ToggleBody(BaseModel):
    enabled: bool


def _fmt(s: Schedule) -> dict:
    return {
        "id": s.id,
        "org_id": s.org_id,
        "name": s.name,
        "description": s.description,
        "cron_expression": s.cron_expression,
        "scenario_ids": _parse_ids(s.scenario_id),
        "deployment_id": s.deployment_id,
        "document_ids": json.loads(s.document_ids or "[]"),
        "folder_ids": json.loads(s.folder_ids or "[]"),
        "document_releases": json.loads(s.document_releases or "{}"),
        "enabled": s.enabled,
        "branch": s.branch,
        "locales": _parse_ids(s.locale),
        "publish_parameters": json.loads(s.publish_parameters or "[]"),
        "last_run_at": s.last_run_at.isoformat() + "+00:00" if s.last_run_at else None,
        "last_run_status": s.last_run_status,
        "consecutive_failures": s.consecutive_failures,
        "next_run_time": sched.next_run_time(s.id),
        "created_at": s.created_at.isoformat() + "+00:00" if s.created_at else None,
        "updated_at": s.updated_at.isoformat() + "+00:00" if s.updated_at else None,
    }


def _get_or_404(schedule_id: str, org_id: str, db: Session) -> Schedule:
    s = (
        db.query(Schedule)
        .filter(Schedule.id == schedule_id, Schedule.org_id == str(org_id))
        .first()
    )
    if not s:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return s


# ── lazy executor singleton ───────────────────────────────────────────────────

_executor: "executor_mod.JobExecutorService | None" = None


def _get_executor():
    global _executor
    if _executor is None:
        from services.job_executor import JobExecutorService
        _executor = JobExecutorService()
    return _executor


async def _run_scheduled_job(schedule_id: str):
    """Called by APScheduler — needs its own DB session."""
    from hop_core.db import get_session_factory
    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        await _get_executor().execute(schedule_id, db, trigger_type="scheduled")
    finally:
        db.close()


# ── routes ─────────────────────────────────────────────────────────────────────

@router.get("/")
def list_schedules(ctx: OrgCtx, db: DB):
    rows = (
        db.query(Schedule)
        .filter(Schedule.org_id == str(ctx.organization_id))
        .order_by(Schedule.created_at.desc())
        .all()
    )
    return [_fmt(r) for r in rows]


@router.get("/{schedule_id}")
def get_schedule(schedule_id: str, ctx: OrgCtx, db: DB):
    return _fmt(_get_or_404(schedule_id, str(ctx.organization_id), db))


@router.post("/", status_code=status.HTTP_201_CREATED)
def create_schedule(body: ScheduleCreate, ctx: OrgCtx, db: DB):
    s = Schedule(
        org_id=str(ctx.organization_id),
        name=body.name,
        description=body.description,
        cron_expression=body.cron_expression,
        scenario_id=json.dumps(body.scenario_ids),
        deployment_id=body.deployment_id,
        document_ids=json.dumps(body.document_ids),
        folder_ids=json.dumps(body.folder_ids),
        document_releases=json.dumps(body.document_releases),
        enabled=body.enabled,
        branch=body.branch,
        locale=json.dumps(body.locales),
        publish_parameters=json.dumps(body.publish_parameters),
    )
    db.add(s)
    db.commit()
    db.refresh(s)

    if s.enabled:
        sched.add_schedule(s.id, s.cron_expression, _run_scheduled_job)

    return _fmt(s)


@router.put("/{schedule_id}")
def update_schedule(schedule_id: str, body: ScheduleUpdate, ctx: OrgCtx, db: DB):
    s = _get_or_404(schedule_id, str(ctx.organization_id), db)

    if body.name is not None:
        s.name = body.name
    if body.description is not None:
        s.description = body.description
    if body.cron_expression is not None:
        s.cron_expression = body.cron_expression
    if body.scenario_ids is not None:
        s.scenario_id = json.dumps(body.scenario_ids)
    if body.deployment_id is not None:
        s.deployment_id = body.deployment_id
    if body.document_ids is not None:
        s.document_ids = json.dumps(body.document_ids)
    if body.folder_ids is not None:
        s.folder_ids = json.dumps(body.folder_ids)
    if body.document_releases is not None:
        s.document_releases = json.dumps(body.document_releases)
    if body.enabled is not None:
        s.enabled = body.enabled
    if body.branch is not None:
        s.branch = body.branch
    if body.locales is not None:
        s.locale = json.dumps(body.locales)
    if body.publish_parameters is not None:
        s.publish_parameters = json.dumps(body.publish_parameters)

    db.commit()
    db.refresh(s)

    if s.enabled:
        sched.add_schedule(s.id, s.cron_expression, _run_scheduled_job)
    else:
        sched.remove_schedule(s.id)

    return _fmt(s)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(schedule_id: str, ctx: OrgCtx, db: DB):
    s = _get_or_404(schedule_id, str(ctx.organization_id), db)
    sched.remove_schedule(s.id)
    db.delete(s)
    db.commit()


@router.patch("/{schedule_id}/toggle")
def toggle_schedule(schedule_id: str, body: ToggleBody, ctx: OrgCtx, db: DB):
    s = _get_or_404(schedule_id, str(ctx.organization_id), db)
    s.enabled = body.enabled
    db.commit()
    db.refresh(s)

    if s.enabled:
        sched.add_schedule(s.id, s.cron_expression, _run_scheduled_job)
    else:
        sched.remove_schedule(s.id)

    return _fmt(s)


@router.post("/{schedule_id}/trigger", status_code=status.HTTP_201_CREATED)
async def trigger_schedule(schedule_id: str, ctx: OrgCtx, db: DB):
    _get_or_404(schedule_id, str(ctx.organization_id), db)  # 404 guard
    executor = _get_executor()
    if executor.is_running(schedule_id):
        raise HTTPException(status_code=409, detail="A job for this schedule is already running")
    result = await executor.execute(schedule_id, db, trigger_type="manual")
    return result
