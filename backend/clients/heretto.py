"""Heretto publishing API client."""

import httpx
import logging
from fastapi import HTTPException
from typing import Any

from settings import get_settings

logger = logging.getLogger(__name__)


def _heretto_exc(exc: httpx.HTTPStatusError) -> HTTPException:
    status = exc.response.status_code
    try:
        body = exc.response.text[:500].strip()
    except Exception:
        body = ""
    if body:
        logger.debug("Heretto API %d response body: %s", status, body)
    if status == 401:
        return HTTPException(status_code=502, detail="Heretto API: authentication failed")
    if status == 403:
        return HTTPException(status_code=502, detail="Heretto API: access forbidden")
    if status == 404:
        return HTTPException(status_code=404, detail="Heretto API: resource not found")
    return HTTPException(status_code=502, detail=f"Heretto API error ({status})")


class HerettoClient:
    def __init__(self):
        s = get_settings()
        self._base_url = s.heretto_api_base_url
        self._auth = (s.heretto_username, s.heretto_password)

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url,
            auth=self._auth,
            headers={"Content-Type": "application/json"},
            timeout=30.0,
        )

    async def get_deployments(self) -> list[dict]:
        async with self._client() as c:
            r = await c.get("/deployments")
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise _heretto_exc(exc) from exc
            data = r.json()
            items: list[dict] = data if isinstance(data, list) else data.get("content", [])
            return [
                {**d, "id": str(d.get("id") or d.get("deploymentIdentifier") or ""),
                 "name": str(d.get("name") or "")}
                for d in items
            ]

    async def get_scenarios(self) -> list[dict]:
        async with self._client() as c:
            r = await c.get("/publishes/scenarios")
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise _heretto_exc(exc) from exc
            data = r.json()
            items: list[dict] = data if isinstance(data, list) else data.get("content", [])
            # Normalise id to str — the Heretto API returns integer IDs
            return [{**s, "id": str(s.get("id") or ""), "name": str(s.get("name") or "")}
                    for s in items]

    async def get_releases(self) -> list[dict]:
        async with self._client() as c:
            r = await c.get("/releases")
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise _heretto_exc(exc) from exc
            return r.json()

    async def get_scenario_parameters(self, scenario_id: str) -> list[dict]:
        async with self._client() as c:
            r = await c.get(f"/publishes/scenarios/{scenario_id}/parameters")
            try:
                r.raise_for_status()
            except httpx.HTTPStatusError as exc:
                raise _heretto_exc(exc) from exc
            data = r.json()
            params = data if isinstance(data, list) else data.get("content", [])
            logger.debug("Scenario %s parameters (raw): %s", scenario_id, params)
            return params

    async def trigger_publishing_job(
        self,
        scenario_id: str,
        deployment_id: str,
        document_ids: list[str],
        parameters: list[dict] | None = None,
    ) -> list[dict]:
        if not document_ids:
            raise ValueError("At least one document ID is required to trigger a publish")

        def _coerce_param_value(v: Any) -> str:
            if isinstance(v, list):
                return ",".join(str(x) for x in v)
            return str(v) if v is not None else ""

        results = []
        async with self._client() as c:
            for file_id in document_ids:
                # Merge all parameters into a single key-value object
                merged_params: dict = {}
                for p in (parameters or []):
                    v = p.get("value")
                    # Skip parameters with no meaningful value — sending empty strings
                    # or empty lists would override scenario defaults with nothing.
                    if v is None or v == [] or v == "":
                        continue
                    merged_params[p["name"]] = _coerce_param_value(v)
                body = {
                    "scenario": int(scenario_id),
                    "description": "",
                    "parameters": [merged_params] if merged_params else [],
                }
                logger.debug(
                    "Heretto publish POST /files/%s/publishes scenario=%s",
                    file_id, scenario_id,
                )
                r = await c.post(f"/files/{file_id}/publishes", json=body)
                logger.debug("Heretto publish response: status=%d", r.status_code)
                try:
                    r.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    raise _heretto_exc(exc) from exc
                data = r.json()
                results.append({
                    **data,
                    "id": str(data.get("id") or data.get("jobId") or ""),
                    "status": str(data.get("status") or "submitted"),
                    "fileId": file_id,
                })
        return results
