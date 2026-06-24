"""Dashboard summary endpoint — org-scoped, auth-protected."""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from hop_core.api.dependencies import CurrentUserContext, get_current_active_user_with_org
from hop_core.db import get_db

from models import JobHistory, Schedule

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

OrgCtx = Annotated[CurrentUserContext, Depends(get_current_active_user_with_org)]
DB = Annotated[Session, Depends(get_db)]


@router.get("/summary")
def get_summary(ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)

    # Get all schedule IDs for this org
    schedules = db.query(Schedule.id, Schedule.name).filter(Schedule.org_id == org_id).all()
    org_ids = [s.id for s in schedules]
    schedule_names = {s.id: s.name for s in schedules}

    # ── per_schedule_stats (last 30 days) ──────────────────────────────────────
    cutoff_30 = datetime.now(timezone.utc) - timedelta(days=30)
    rows = (
        db.query(JobHistory.schedule_id, JobHistory.status, func.count())
        .filter(JobHistory.schedule_id.in_(org_ids), JobHistory.started_at >= cutoff_30)
        .group_by(JobHistory.schedule_id, JobHistory.status)
        .all()
    )

    per_schedule_stats: dict = {}
    for schedule_id, status, count in rows:
        if schedule_id not in per_schedule_stats:
            per_schedule_stats[schedule_id] = {"total": 0, "succeeded": 0, "failed": 0}
        per_schedule_stats[schedule_id]["total"] += count
        if status == "completed":
            per_schedule_stats[schedule_id]["succeeded"] += count
        elif status == "failed":
            per_schedule_stats[schedule_id]["failed"] += count

    # ── daily_volumes (last 14 days) ───────────────────────────────────────────
    cutoff_14 = datetime.now(timezone.utc) - timedelta(days=14)
    date_col = func.date(JobHistory.started_at)
    vol_rows = (
        db.query(date_col, JobHistory.status, func.count())
        .filter(JobHistory.schedule_id.in_(org_ids), JobHistory.started_at >= cutoff_14)
        .group_by(date_col, JobHistory.status)
        .all()
    )

    vol_map: dict = {}
    for date_str, status, count in vol_rows:
        if date_str not in vol_map:
            vol_map[date_str] = {"total": 0, "succeeded": 0, "failed": 0}
        vol_map[date_str]["total"] += count
        if status == "completed":
            vol_map[date_str]["succeeded"] += count
        elif status == "failed":
            vol_map[date_str]["failed"] += count

    # Zero-fill missing dates for the full 14-day window
    daily_volumes = []
    today = datetime.now(timezone.utc).date()
    for i in range(13, -1, -1):
        d = (today - timedelta(days=i)).isoformat()
        entry = vol_map.get(d, {"total": 0, "succeeded": 0, "failed": 0})
        daily_volumes.append({"date": d, **entry})

    # ── top_locales (last 30 days, with success/failure breakdown) ────────────────
    recent_for_locales = (
        db.query(JobHistory.request_payload, JobHistory.status, JobHistory.schedule_id)
        .filter(JobHistory.schedule_id.in_(org_ids), JobHistory.started_at >= cutoff_30)
        .order_by(JobHistory.started_at.desc())
        .all()
    )

    locale_data: dict = {}
    for payload_str, status, schedule_id in recent_for_locales:
        try:
            payload = json.loads(payload_str or "{}")
            for locale in payload.get("locales", []):
                if locale not in locale_data:
                    locale_data[locale] = {"total": 0, "succeeded": 0, "failed": 0, "schedules": {}}
                locale_data[locale]["total"] += 1
                if status == "completed":
                    locale_data[locale]["succeeded"] += 1
                elif status == "failed":
                    locale_data[locale]["failed"] += 1
                if schedule_id:
                    locale_data[locale]["schedules"][schedule_id] = (
                        locale_data[locale]["schedules"].get(schedule_id, 0) + 1
                    )
        except (json.JSONDecodeError, TypeError):
            pass

    top_locales = {}
    for locale, data in sorted(locale_data.items(), key=lambda x: x[1]["total"], reverse=True)[:10]:
        top_schedules = sorted(data["schedules"].items(), key=lambda x: x[1], reverse=True)[:3]
        top_locales[locale] = {
            "total": data["total"],
            "succeeded": data["succeeded"],
            "failed": data["failed"],
            "top_schedules": [
                {"name": schedule_names.get(sid, sid), "count": cnt}
                for sid, cnt in top_schedules
            ],
        }

    return {
        "per_schedule_stats": per_schedule_stats,
        "daily_volumes": daily_volumes,
        "top_locales": top_locales,
    }
