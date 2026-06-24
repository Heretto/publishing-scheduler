"""Org-scoped settings — status value exclusion list."""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from hop_core.api.dependencies import CurrentUserContext, get_current_active_user_with_org
from hop_core.db import get_db

from models import StatusValueExclusion

router = APIRouter(prefix="/settings", tags=["settings"])

OrgCtx = Annotated[CurrentUserContext, Depends(get_current_active_user_with_org)]
DB = Annotated[Session, Depends(get_db)]


class ExclusionBody(BaseModel):
    value: str


@router.get("/status-exclusions")
def list_exclusions(ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)
    rows = db.query(StatusValueExclusion).filter(
        StatusValueExclusion.org_id == org_id
    ).order_by(StatusValueExclusion.value).all()
    return [{"value": r.value, "created_at": r.created_at} for r in rows]


@router.post("/status-exclusions", status_code=201)
def add_exclusion(body: ExclusionBody, ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)
    existing = db.query(StatusValueExclusion).filter(
        StatusValueExclusion.org_id == org_id,
        StatusValueExclusion.value == body.value,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Value already excluded")
    row = StatusValueExclusion(org_id=org_id, value=body.value)
    db.add(row)
    db.commit()
    logger.info("AUDIT exclusion_added value=%r org=%s", body.value, org_id)
    return {"value": row.value, "created_at": row.created_at}


@router.delete("/status-exclusions/{value}", status_code=204)
def remove_exclusion(value: str, ctx: OrgCtx, db: DB):
    org_id = str(ctx.organization_id)
    row = db.query(StatusValueExclusion).filter(
        StatusValueExclusion.org_id == org_id,
        StatusValueExclusion.value == value,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Exclusion not found")
    db.delete(row)
    db.commit()
    logger.info("AUDIT exclusion_removed value=%r org=%s", value, org_id)
