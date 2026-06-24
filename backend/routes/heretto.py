"""Heretto proxy routes — deployments, scenarios, CCMS browsing."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from hop_core.api.dependencies import CurrentUserContext, get_current_active_user_with_org
from hop_core.db import get_db

from clients.heretto import HerettoClient
from clients.heretto_ccms import HerettoCcmsClient
from services import status_cache

router = APIRouter(prefix="/heretto", tags=["heretto"])

OrgCtx = Annotated[CurrentUserContext, Depends(get_current_active_user_with_org)]
DB = Annotated[Session, Depends(get_db)]


class SearchBody(BaseModel):
    queryString: str = ""
    searchResultType: str = "FILES_ONLY"
    branch: str | None = None
    foldersToSearch: dict | None = None
    startOffset: int = 0
    endOffset: int = 50
    statusFilter: str | None = None


class LocalesBody(BaseModel):
    document_ids: list[str]


@router.get("/deployments")
async def list_deployments(ctx: OrgCtx):
    return await HerettoClient().get_deployments()


@router.get("/scenarios")
async def list_scenarios(ctx: OrgCtx):
    return await HerettoClient().get_scenarios()


@router.get("/scenarios/{scenario_id}/parameters")
async def get_scenario_parameters(scenario_id: str, ctx: OrgCtx):
    return await HerettoClient().get_scenario_parameters(scenario_id)


@router.get("/releases")
async def list_releases(ctx: OrgCtx):
    return await HerettoClient().get_releases()


@router.get("/ccms/branches")
async def list_branches(ctx: OrgCtx):
    return await HerettoCcmsClient().get_branches()


@router.get("/ccms/root")
async def get_root_folder(ctx: OrgCtx, branch: str | None = None):
    return await HerettoCcmsClient().get_root_folder(branch)


@router.post("/ccms/locales")
async def get_locales_for_documents(body: LocalesBody, ctx: OrgCtx):
    return await HerettoCcmsClient().get_locales_for_documents(body.document_ids)


@router.get("/ccms/folders/search")
async def search_folders(
    ctx: OrgCtx,
    q: str = Query(alias="q", default=""),
    branch: str | None = Query(default=None),
):
    return await HerettoCcmsClient().search_folders(q, branch)


@router.get("/ccms/folders/{folder_id}")
async def get_folder_contents(folder_id: str, ctx: OrgCtx):
    return await HerettoCcmsClient().get_folder_contents(folder_id)


@router.get("/ccms/documents/{doc_id}/releases")
async def get_document_releases(doc_id: str, ctx: OrgCtx):
    return await HerettoCcmsClient().get_releases_for_document(doc_id)


@router.get("/ccms/documents/{doc_id}")
async def get_document_info(doc_id: str, ctx: OrgCtx):
    return await HerettoCcmsClient().get_document_info(doc_id)


@router.post("/ccms/search")
async def search_documents(body: SearchBody, ctx: OrgCtx):
    drilldowns = [["status", body.statusFilter]] if body.statusFilter else None
    return await HerettoCcmsClient().search_documents(
        query_string=body.queryString,
        search_result_type=body.searchResultType,
        branch=body.branch,
        folders_to_search=body.foldersToSearch,
        start_offset=body.startOffset,
        end_offset=body.endOffset,
        drilldowns=drilldowns,
    )


@router.get("/ccms/metadata/status-values")
async def get_status_values(ctx: OrgCtx, db: DB, branch: str | None = None):
    from models import StatusValueExclusion
    org_id = str(ctx.organization_id)
    excluded = {
        row.value
        for row in db.query(StatusValueExclusion.value)
            .filter(StatusValueExclusion.org_id == org_id)
            .all()
    }

    if status_cache.is_ready():
        values = status_cache.get_distinct_values()
    else:
        values = await HerettoCcmsClient().get_status_values(branch)

    return [v for v in values if v not in excluded]


@router.get("/ccms/documents/{doc_id}/status")
async def get_document_status(doc_id: str, ctx: OrgCtx):
    cached = status_cache.get(doc_id)
    if cached is not None:
        return {"status": cached}
    return {"status": await HerettoCcmsClient().get_document_status(doc_id)}
