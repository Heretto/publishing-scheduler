"""Schedule CRUD routes — org-scoped, auth-protected."""

import json
import logging
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from hop_core.api.dependencies import CurrentUserContext, get_current_active_user_with_org
from hop_core.core.security import decrypt_credentials, encrypt_credentials
from hop_core.db import get_db

from limiter import limiter
from models import DeliveryTarget, Schedule
from services import scheduler as sched
from utils import parse_ids

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schedules", tags=["schedules"])

# Shared dependency aliases
OrgCtx = Annotated[CurrentUserContext, Depends(get_current_active_user_with_org)]
DB = Annotated[Session, Depends(get_db)]

_ID_MAX_LEN = 255


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class ScheduleCreate(BaseModel):
    name: str = Field(..., max_length=255)
    description: str = Field("", max_length=2000)
    cron_expression: str = Field(..., max_length=100)
    scenario_ids: list[str] = Field(..., max_length=20)

    @field_validator("scenario_ids", mode="before")
    @classmethod
    def coerce_scenario_ids(cls, v: object) -> list[str]:
        if isinstance(v, list):
            return [str(x) for x in v]
        return v  # type: ignore[return-value]
    deployment_id: str = Field("", max_length=255)
    document_ids: list[str] = Field([], max_length=500)
    folder_ids: list[str] = Field([], max_length=100)
    document_releases: dict[str, str] = {}
    enabled: bool = True
    branch: str = Field("master", max_length=255)
    locales: list[str] = Field([], max_length=50)
    publish_parameters: list[dict] = Field([], max_length=50)

    @field_validator("document_ids", "folder_ids", "locales", mode="after")
    @classmethod
    def check_item_lengths(cls, v: list[str]) -> list[str]:
        for item in v:
            if len(item) > _ID_MAX_LEN:
                raise ValueError(f"Each item must be at most {_ID_MAX_LEN} characters")
        return v


class ScheduleUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    description: str | None = Field(None, max_length=2000)
    cron_expression: str | None = Field(None, max_length=100)
    scenario_ids: list[str] | None = Field(None, max_length=20)

    @field_validator("scenario_ids", mode="before")
    @classmethod
    def coerce_scenario_ids(cls, v: object) -> list[str] | None:
        if isinstance(v, list):
            return [str(x) for x in v]
        return v  # type: ignore[return-value]
    deployment_id: str | None = Field(None, max_length=255)
    document_ids: list[str] | None = Field(None, max_length=500)
    folder_ids: list[str] | None = Field(None, max_length=100)
    document_releases: dict[str, str] | None = None
    enabled: bool | None = None
    branch: str | None = Field(None, max_length=255)
    locales: list[str] | None = Field(None, max_length=50)
    publish_parameters: list[dict] | None = Field(None, max_length=50)

    @field_validator("document_ids", "folder_ids", "locales", mode="after")
    @classmethod
    def check_item_lengths(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        for item in v:
            if len(item) > _ID_MAX_LEN:
                raise ValueError(f"Each item must be at most {_ID_MAX_LEN} characters")
        return v


class ToggleBody(BaseModel):
    enabled: bool


def _fmt(s: Schedule) -> dict:
    return {
        "id": s.id,
        "org_id": s.org_id,
        "name": s.name,
        "description": s.description,
        "cron_expression": s.cron_expression,
        "scenario_ids": parse_ids(s.scenario_id),
        "deployment_id": s.deployment_id,
        "document_ids": json.loads(s.document_ids or "[]"),
        "folder_ids": json.loads(s.folder_ids or "[]"),
        "document_releases": json.loads(s.document_releases or "{}"),
        "enabled": s.enabled,
        "branch": s.branch,
        "locales": parse_ids(s.locale),
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
    org_id = str(ctx.organization_id)
    s = Schedule(
        org_id=org_id,
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

    logger.info("AUDIT schedule_created id=%s name=%r org=%s", s.id, s.name, org_id)
    return _fmt(s)


@router.put("/{schedule_id}")
def update_schedule(schedule_id: str, body: ScheduleUpdate, ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)
    s = _get_or_404(schedule_id, org_id, db)

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

    logger.info("AUDIT schedule_updated id=%s name=%r org=%s", s.id, s.name, org_id)
    return _fmt(s)


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(schedule_id: str, ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)
    s = _get_or_404(schedule_id, org_id, db)
    sched.remove_schedule(s.id)
    db.delete(s)
    db.commit()
    logger.info("AUDIT schedule_deleted id=%s name=%r org=%s", schedule_id, s.name, org_id)


@router.patch("/{schedule_id}/toggle")
def toggle_schedule(schedule_id: str, body: ToggleBody, ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)
    s = _get_or_404(schedule_id, org_id, db)
    s.enabled = body.enabled
    db.commit()
    db.refresh(s)

    if s.enabled:
        sched.add_schedule(s.id, s.cron_expression, _run_scheduled_job)
    else:
        sched.remove_schedule(s.id)

    logger.info("AUDIT schedule_toggled id=%s enabled=%s org=%s", s.id, s.enabled, org_id)
    return _fmt(s)


@router.post("/{schedule_id}/trigger", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def trigger_schedule(request: Request, schedule_id: str, ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)
    _get_or_404(schedule_id, org_id, db)  # 404 guard
    executor = _get_executor()
    if executor.is_running(schedule_id):
        raise HTTPException(status_code=409, detail="A job for this schedule is already running")
    logger.info("AUDIT schedule_triggered id=%s org=%s", schedule_id, org_id)
    result = await executor.execute(schedule_id, db, trigger_type="manual")
    return result


# ── Delivery target sub-resource ──────────────────────────────────────────────
# One optional delivery target per schedule: GET / PUT / DELETE
# PUT is upsert — creates on first call, replaces on subsequent calls.
# Sensitive fields (password, secret_access_key) are masked as "***" in GET
# responses.  Sending "***" back in a PUT preserves the stored value so the
# frontend does not need to re-supply credentials on every edit.

_MASK = "***"


class SFTPTargetBody(BaseModel):
    type: Literal["sftp"]
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(22, ge=1, le=65535)
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=1, max_length=1024)
    remote_path: str = Field("/", max_length=1024)
    enabled: bool = True


class S3TargetBody(BaseModel):
    type: Literal["s3"]
    bucket: str = Field(..., min_length=1, max_length=255)
    prefix: str = Field("", max_length=1024)
    region: str = Field(..., min_length=1, max_length=64)
    access_key_id: str = Field(..., min_length=1, max_length=255)
    secret_access_key: str = Field(..., min_length=1, max_length=1024)
    enabled: bool = True


DeliveryTargetBody = Annotated[
    SFTPTargetBody | S3TargetBody,
    Field(discriminator="type"),
]


def _mask_config(target_type: str, config: dict) -> dict:
    """Return config with sensitive fields replaced by the mask token."""
    masked = dict(config)
    if target_type == "sftp":
        masked["password"] = _MASK
    elif target_type == "s3":
        masked["secret_access_key"] = _MASK
    return masked


def _fmt_target(t: DeliveryTarget) -> dict:
    try:
        config = decrypt_credentials(t.config_encrypted)
    except Exception:
        config = {}
    return {
        "id": t.id,
        "schedule_id": t.schedule_id,
        "type": t.type,
        "config": _mask_config(t.type, config),
        "enabled": t.enabled,
        "created_at": t.created_at.isoformat() + "+00:00" if t.created_at else None,
        "updated_at": t.updated_at.isoformat() + "+00:00" if t.updated_at else None,
    }


@router.get("/{schedule_id}/delivery-target")
def get_delivery_target(schedule_id: str, ctx: OrgCtx, db: DB):
    _get_or_404(schedule_id, str(ctx.organization_id), db)
    target = (
        db.query(DeliveryTarget)
        .filter(DeliveryTarget.schedule_id == schedule_id)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="No delivery target configured")
    return _fmt_target(target)


@router.put("/{schedule_id}/delivery-target", status_code=status.HTTP_200_OK)
def upsert_delivery_target(
    schedule_id: str,
    body: DeliveryTargetBody,
    ctx: OrgCtx,
    db: DB,
):
    org_id = str(ctx.organization_id)
    _get_or_404(schedule_id, org_id, db)

    existing = (
        db.query(DeliveryTarget)
        .filter(DeliveryTarget.schedule_id == schedule_id)
        .first()
    )

    # Build the config dict from the request body, excluding meta fields.
    new_config = body.model_dump(exclude={"type", "enabled"})

    # If the client sent the mask token back, preserve the stored secret.
    if body.type == "sftp" and new_config.get("password") == _MASK:
        if existing and existing.type == "sftp":
            try:
                old = decrypt_credentials(existing.config_encrypted)
                new_config["password"] = old.get("password", "")
            except Exception:
                pass
        if not new_config.get("password") or new_config["password"] == _MASK:
            raise HTTPException(status_code=422, detail="SFTP password is required")

    if body.type == "s3" and new_config.get("secret_access_key") == _MASK:
        if existing and existing.type == "s3":
            try:
                old = decrypt_credentials(existing.config_encrypted)
                new_config["secret_access_key"] = old.get("secret_access_key", "")
            except Exception:
                pass
        if not new_config.get("secret_access_key") or new_config["secret_access_key"] == _MASK:
            raise HTTPException(status_code=422, detail="S3 secret access key is required")

    encrypted = encrypt_credentials(new_config)

    if existing:
        existing.type = body.type
        existing.config_encrypted = encrypted
        existing.enabled = body.enabled
        db.commit()
        db.refresh(existing)
        logger.info("AUDIT delivery_target_updated schedule=%s type=%s org=%s", schedule_id, body.type, org_id)
        return _fmt_target(existing)

    target = DeliveryTarget(
        schedule_id=schedule_id,
        type=body.type,
        config_encrypted=encrypted,
        enabled=body.enabled,
    )
    db.add(target)
    db.commit()
    db.refresh(target)
    logger.info("AUDIT delivery_target_created schedule=%s type=%s org=%s", schedule_id, body.type, org_id)
    return _fmt_target(target)


@router.delete("/{schedule_id}/delivery-target", status_code=status.HTTP_204_NO_CONTENT)
def delete_delivery_target(schedule_id: str, ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)
    _get_or_404(schedule_id, org_id, db)
    target = (
        db.query(DeliveryTarget)
        .filter(DeliveryTarget.schedule_id == schedule_id)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="No delivery target configured")
    db.delete(target)
    db.commit()
    logger.info("AUDIT delivery_target_deleted schedule=%s org=%s", schedule_id, org_id)
