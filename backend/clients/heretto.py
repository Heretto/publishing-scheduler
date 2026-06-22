"""Heretto publishing API client."""

import httpx
from typing import Any

from settings import get_settings


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
            r.raise_for_status()
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
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, list) else data.get("content", [])

    async def get_releases(self) -> list[dict]:
        async with self._client() as c:
            r = await c.get("/releases")
            r.raise_for_status()
            return r.json()

    async def get_scenario_parameters(self, scenario_id: str) -> list[dict]:
        async with self._client() as c:
            r = await c.get(f"/publishes/scenarios/{scenario_id}/parameters")
            r.raise_for_status()
            data = r.json()
            return data if isinstance(data, list) else data.get("content", [])

    async def trigger_publishing_job(
        self,
        scenario_id: str,
        deployment_id: str,
        document_ids: list[str],
        parameters: list[dict] | None = None,
    ) -> list[dict]:
        if not document_ids:
            raise ValueError("At least one document ID is required to trigger a publish")

        results = []
        async with self._client() as c:
            for file_id in document_ids:
                r = await c.post(
                    f"/files/{file_id}/publishes",
                    json={
                        "scenario": int(scenario_id),
                        "description": "",
                        "parameters": parameters or [],
                    },
                )
                r.raise_for_status()
                data = r.json()
                results.append({
                    **data,
                    "id": str(data.get("id") or data.get("jobId") or ""),
                    "status": str(data.get("status") or "submitted"),
                    "fileId": file_id,
                })
        return results
