"""Heretto proxy routes — deployments, scenarios, CCMS browsing."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from hop_core.api.dependencies import get_current_active_user

from clients.heretto import HerettoClient
from clients.heretto_ccms import HerettoCcmsClient

router = APIRouter(prefix="/heretto", tags=["heretto"])

# Auth guard — any authenticated user can hit these
_auth = Depends(get_current_active_user)


class SearchBody(BaseModel):
    queryString: str = ""
    searchResultType: str = "FILES_ONLY"
    branch: str | None = None
    foldersToSearch: dict | None = None
    startOffset: int = 0
    endOffset: int = 50


@router.get("/deployments", dependencies=[_auth])
async def list_deployments():
    return await HerettoClient().get_deployments()


@router.get("/scenarios", dependencies=[_auth])
async def list_scenarios():
    return await HerettoClient().get_scenarios()


@router.get("/scenarios/{scenario_id}/parameters", dependencies=[_auth])
async def get_scenario_parameters(scenario_id: str):
    return await HerettoClient().get_scenario_parameters(scenario_id)


@router.get("/releases", dependencies=[_auth])
async def list_releases():
    return await HerettoClient().get_releases()


@router.get("/ccms/branches", dependencies=[_auth])
async def list_branches():
    return await HerettoCcmsClient().get_branches()


@router.get("/ccms/root", dependencies=[_auth])
async def get_root_folder(branch: str | None = None):
    return await HerettoCcmsClient().get_root_folder(branch)


@router.get("/ccms/folders/search", dependencies=[_auth])
async def search_folders(
    q: str = Query(alias="q", default=""),
    branch: str | None = Query(default=None),
):
    return await HerettoCcmsClient().search_folders(q, branch)


@router.get("/ccms/folders/{folder_id}", dependencies=[_auth])
async def get_folder_contents(folder_id: str):
    return await HerettoCcmsClient().get_folder_contents(folder_id)


@router.get("/ccms/documents/{doc_id}", dependencies=[_auth])
async def get_document_info(doc_id: str):
    return await HerettoCcmsClient().get_document_info(doc_id)


@router.post("/ccms/search", dependencies=[_auth])
async def search_documents(body: SearchBody):
    return await HerettoCcmsClient().search_documents(
        query_string=body.queryString,
        search_result_type=body.searchResultType,
        branch=body.branch,
        folders_to_search=body.foldersToSearch,
        start_offset=body.startOffset,
        end_offset=body.endOffset,
    )
