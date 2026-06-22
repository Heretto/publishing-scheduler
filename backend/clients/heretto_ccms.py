"""Heretto CCMS (REST + search) client."""

import httpx
from fastapi import HTTPException
from lxml import etree
from typing import Any

from settings import get_settings
from clients.heretto import _heretto_exc


def _text(el: etree._Element | None) -> str:
    if el is None:
        return ""
    return (el.text or "").strip()


def _attr(el: etree._Element, *names: str) -> str:
    for name in names:
        v = el.get(name)
        if v:
            return v
    return ""


class HerettoCcmsClient:
    def __init__(self):
        s = get_settings()
        auth = (s.heretto_username, s.heretto_password)
        self._org = s.heretto_org
        self._branch = s.heretto_branch
        self._repo = s.heretto_repository
        self._search_root = (
            f"/db/organizations/{self._org}/repositories"
            f"/{self._branch}/{self._repo}/documents/"
        )
        self._rest_client = httpx.AsyncClient(
            base_url=s.heretto_ccms_base_url,
            auth=auth,
            headers={"Accept": "application/xml"},
            timeout=30.0,
        )
        self._search_client = httpx.AsyncClient(
            base_url=s.heretto_search_base_url,
            auth=auth,
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Accept": "application/json",
            },
            timeout=30.0,
        )

    async def get_branches(self) -> list[dict]:
        async with self._rest_client as c:
            r = await c.get("/branches/", headers={"Accept": "application/xml"})
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise _heretto_exc(exc) from exc
            root = etree.fromstring(r.content)
            return [
                {
                    "id": _attr(b, "id", "uuid") or _text(b.find("id")),
                    "name": _attr(b, "name") or _text(b.find("name")),
                    "repository": _attr(b, "repository") or _text(b.find("repository")),
                }
                for b in root.iter("branch")
            ]

    async def get_folder_contents(self, folder_id: str) -> dict:
        async with self._rest_client as c:
            r = await c.get(
                f"/all-files/{folder_id}", headers={"Accept": "application/xml"}
            )
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise _heretto_exc(exc) from exc
            root = etree.fromstring(r.content)
            return self._normalize_folder(root)

    async def get_document_info(self, doc_id: str) -> dict:
        async with self._rest_client as c:
            r = await c.get(
                f"/all-files/{doc_id}", headers={"Accept": "application/xml"}
            )
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise _heretto_exc(exc) from exc
            root = etree.fromstring(r.content)
            return self._normalize_resource(root)

    async def search_folders(self, folder_name: str, branch: str | None = None) -> dict:
        result = await self.search_documents(
            query_string=folder_name,
            search_result_type="FOLDERS_ONLY",
            branch=branch,
        )
        query_lower = folder_name.lower()
        filtered = [r for r in result["results"] if query_lower in r["title"].lower()]
        return {"results": filtered, "total": len(filtered)}

    async def search_documents(
        self,
        query_string: str = "",
        search_result_type: str = "FILES_ONLY",
        branch: str | None = None,
        folders_to_search: dict | None = None,
        start_offset: int = 0,
        end_offset: int = 50,
    ) -> dict:
        root_path = self._build_search_path(branch)
        body: dict[str, Any] = {
            "queryString": query_string,
            "searchResultType": search_result_type,
            "startOffset": start_offset,
            "endOffset": end_offset,
            "foldersToSearch": folders_to_search or {root_path: True},
        }
        async with self._search_client as c:
            r = await c.post("/search", json=body)
            if r.status_code == 204 or not r.content:
                return {"results": [], "total": 0}
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise _heretto_exc(exc) from exc
            return self._normalize_search_response(r.json())

    # ── normalizers ───────────────────────────────────────────────────────────

    def _build_search_path(self, branch: str | None) -> str:
        b = branch or self._branch
        return f"/db/organizations/{self._org}/repositories/{b}/{self._repo}/documents/"

    def _normalize_folder(self, root: etree._Element) -> dict:
        folder_id = _attr(root, "id", "uuid") or _text(root.find("id"))
        title = _attr(root, "title") or _text(root.find("title")) or _text(root.find("name"))
        children = self._extract_children(root)
        return {"id": folder_id, "title": title, "type": "folder", "children": children}

    def _normalize_resource(self, root: etree._Element) -> dict:
        return {
            "id": _attr(root, "id", "uuid") or _text(root.find("id")),
            "title": _attr(root, "title") or _text(root.find("title")) or _text(root.find("name")),
            "type": _attr(root, "type", "resourceType") or _text(root.find("type")),
            "owner": _text(root.find("owner")) or None,
            "created": _text(root.find("created")) or None,
            "modified": _text(root.find("modified")) or None,
        }

    def _extract_children(self, root: etree._Element) -> list[dict]:
        children_el = root.find("children")
        if children_el is None:
            return []
        items = []
        for child in children_el:
            resource_type = child.get("type") or child.tag or ""
            if resource_type == "children":
                continue
            items.append({
                "id": _attr(child, "id", "uuid") or _text(child.find("id")),
                "title": (
                    _attr(child, "title")
                    or _text(child.find("title"))
                    or _text(child.find("name"))
                ),
                "type": resource_type if resource_type not in ("folder", "resource") else resource_type,
            })
        return items

    def _normalize_search_response(self, data: dict) -> dict:
        hits = data.get("hits") or data.get("results") or data.get("items") or []
        if not isinstance(hits, list):
            hits = [hits]
        results = []
        for hit in hits:
            entity = hit.get("fileEntity") or hit
            metadata = entity.get("metadata") or {}
            meta_data = metadata.get("data") or {}
            entity_class = str(entity.get("@class") or "")
            is_folder = entity_class.endswith("FolderImpl") or "numChildFolders" in entity
            resource_type = (
                "folder"
                if is_folder
                else str(entity.get("mimeType") or entity.get("type") or "")
            )
            results.append({
                "id": str(entity.get("ID") or entity.get("uuid") or entity.get("id") or ""),
                "title": str(meta_data.get("title") or entity.get("name") or entity.get("title") or ""),
                "type": resource_type,
            })
        total = (
            data.get("totalResults")
            if isinstance(data.get("totalResults"), int)
            else data.get("total", len(results))
        )
        return {"results": results, "total": total}
