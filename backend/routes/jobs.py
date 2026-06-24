"""Job history routes — read-only, org-scoped."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from hop_core.api.dependencies import CurrentUserContext, get_current_active_user_with_org
from hop_core.db import get_db

from models import JobHistory, Schedule

router = APIRouter(prefix="/jobs", tags=["jobs"])

OrgCtx = Annotated[CurrentUserContext, Depends(get_current_active_user_with_org)]
DB = Annotated[Session, Depends(get_db)]

MAX_LIMIT = 100


def _fmt(j: JobHistory, schedule_name: str | None = None) -> dict:
    return {
        "id": j.id,
        "schedule_id": j.schedule_id,
        "schedule_name": schedule_name,
        "status": j.status,
        "trigger_type": j.trigger_type,
        "started_at": j.started_at.isoformat() + "+00:00" if j.started_at else None,
        "completed_at": j.completed_at.isoformat() + "+00:00" if j.completed_at else None,
        "heretto_job_id": j.heretto_job_id,
        "request_payload": json.loads(j.request_payload or "{}"),
        "response_payload": json.loads(j.response_payload or "{}"),
        "error": j.error,
    }


def _schedule_name_map(org_id: str, db: Session) -> dict[str, str]:
    rows = db.query(Schedule.id, Schedule.name).filter(Schedule.org_id == org_id).all()
    return {str(r[0]): r[1] for r in rows}


@router.get("/")
def list_jobs(
    ctx: OrgCtx,
    db: DB,
    page: int = Query(default=1, ge=1, le=10_000),
    limit: int = Query(default=20, ge=1, le=MAX_LIMIT),
    schedule_id: str | None = Query(default=None),
    status: str | None = Query(default=None),
):
    org_id = str(ctx.organization_id)
    name_map = _schedule_name_map(org_id, db)
    org_schedule_ids = list(name_map.keys())

    q = db.query(JobHistory).filter(JobHistory.schedule_id.in_(org_schedule_ids))
    if schedule_id:
        q = q.filter(JobHistory.schedule_id == schedule_id)
    if status:
        q = q.filter(JobHistory.status == status)

    total = q.count()
    rows = q.order_by(JobHistory.started_at.desc()).offset((page - 1) * limit).limit(limit).all()

    return {
        "data": [_fmt(j, name_map.get(j.schedule_id)) for j in rows],
        "total": total,
        "page": page,
        "limit": limit,
        "totalPages": -(-total // limit),
    }


@router.get("/{job_id}")
def get_job(job_id: str, ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)
    name_map = _schedule_name_map(org_id, db)
    job = (
        db.query(JobHistory)
        .filter(JobHistory.id == job_id, JobHistory.schedule_id.in_(list(name_map.keys())))
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _fmt(job, name_map.get(job.schedule_id))
