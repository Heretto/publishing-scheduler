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
from services.heretto_connection import Conn

router = APIRouter(prefix="/scheduler/heretto", tags=["heretto"])

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
async def list_deployments(conn: Conn):
    return await HerettoClient(conn).get_deployments()


@router.get("/scenarios")
async def list_scenarios(conn: Conn):
    return await HerettoClient(conn).get_scenarios()


@router.get("/scenarios/{scenario_id}/parameters")
async def get_scenario_parameters(scenario_id: str, conn: Conn):
    return await HerettoClient(conn).get_scenario_parameters(scenario_id)


@router.get("/releases")
async def list_releases(conn: Conn):
    return await HerettoClient(conn).get_releases()


@router.get("/ccms/branches")
async def list_branches(conn: Conn):
    return await HerettoCcmsClient(conn).get_branches()


@router.get("/ccms/root")
async def get_root_folder(conn: Conn, branch: str | None = None):
    return await HerettoCcmsClient(conn).get_root_folder(branch)


@router.post("/ccms/locales")
async def get_locales_for_documents(body: LocalesBody, conn: Conn):
    return await HerettoCcmsClient(conn).get_locales_for_documents(body.document_ids)


@router.get("/ccms/folders/search")
async def search_folders(
    conn: Conn,
    q: str = Query(alias="q", default=""),
    branch: str | None = Query(default=None),
):
    return await HerettoCcmsClient(conn).search_folders(q, branch)


@router.get("/ccms/folders/{folder_id}")
async def get_folder_contents(folder_id: str, conn: Conn):
    return await HerettoCcmsClient(conn).get_folder_contents(folder_id)


@router.get("/ccms/documents/{doc_id}/releases")
async def get_document_releases(doc_id: str, conn: Conn):
    return await HerettoCcmsClient(conn).get_releases_for_document(doc_id)


@router.get("/ccms/documents/{doc_id}")
async def get_document_info(doc_id: str, conn: Conn):
    return await HerettoCcmsClient(conn).get_document_info(doc_id)


@router.post("/ccms/search")
async def search_documents(body: SearchBody, conn: Conn):
    drilldowns = [["status", body.statusFilter]] if body.statusFilter else None
    return await HerettoCcmsClient(conn).search_documents(
        query_string=body.queryString,
        search_result_type=body.searchResultType,
        branch=body.branch,
        folders_to_search=body.foldersToSearch,
        start_offset=body.startOffset,
        end_offset=body.endOffset,
        drilldowns=drilldowns,
    )


@router.get("/ccms/metadata/status-values")
async def get_status_values(ctx: OrgCtx, db: DB, conn: Conn, branch: str | None = None):
    from models import StatusValueExclusion
    org_id = str(ctx.organization_id)
    excluded = {
        row.value
        for row in db.query(StatusValueExclusion.value)
            .filter(StatusValueExclusion.org_id == org_id)
            .all()
    }

    if status_cache.is_ready(conn.id):
        values = status_cache.get_distinct_values(conn.id)
    else:
        status_cache.ensure_loading(conn)
        values = await HerettoCcmsClient(conn).get_status_values(branch)

    return [v for v in values if v not in excluded]


@router.get("/ccms/documents/{doc_id}/status")
async def get_document_status(doc_id: str, conn: Conn):
    cached = status_cache.get(conn.id, doc_id)
    if cached is not None:
        return {"status": cached}
    status_cache.ensure_loading(conn)
    return {"status": await HerettoCcmsClient(conn).get_document_status(doc_id)}


@router.get("/connection")
async def get_connection(conn: Conn):
    """The Heretto connection this organization's schedules use (409 if none)."""
    return {"id": conn.id, "name": conn.name, "host": conn.host}
