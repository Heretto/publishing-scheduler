"""Tests for HerettoClient — focuses on scenario ID normalisation and publish calls."""

import json
import pytest
import respx
import httpx

from clients.heretto import HerettoClient


BASE = "https://test.heretto.com/ezdnxtgen/api/v2"


@pytest.fixture
def client(heretto_conn):
    return HerettoClient(heretto_conn)


def test_uses_connection_host_and_token(heretto_conn):
    c = HerettoClient(heretto_conn)
    assert c._base_url == BASE
    assert c._auth == ("testuser", "testtoken")


@pytest.mark.asyncio
class TestGetScenarios:
    async def test_integer_ids_normalised_to_strings(self, client):
        """Heretto returns integer scenario IDs; they must be coerced to str."""
        payload = [
            {"id": 500009, "name": "HTML5"},
            {"id": 500010, "name": "PDF"},
        ]
        with respx.mock(base_url=BASE) as mock:
            mock.get("/publishes/scenarios").mock(
                return_value=httpx.Response(200, json=payload)
            )
            result = await client.get_scenarios()

        assert result[0]["id"] == "500009"
        assert result[1]["id"] == "500010"

    async def test_string_ids_preserved(self, client):
        payload = [{"id": "abc123", "name": "Custom"}]
        with respx.mock(base_url=BASE) as mock:
            mock.get("/publishes/scenarios").mock(
                return_value=httpx.Response(200, json=payload)
            )
            result = await client.get_scenarios()

        assert result[0]["id"] == "abc123"

    async def test_name_normalised(self, client):
        payload = [{"id": 1, "name": "My Scenario"}]
        with respx.mock(base_url=BASE) as mock:
            mock.get("/publishes/scenarios").mock(
                return_value=httpx.Response(200, json=payload)
            )
            result = await client.get_scenarios()

        assert result[0]["name"] == "My Scenario"

    async def test_content_wrapper_unwrapped(self, client):
        """API may return {content: [...]} envelope."""
        payload = {"content": [{"id": 7, "name": "Wrapped"}]}
        with respx.mock(base_url=BASE) as mock:
            mock.get("/publishes/scenarios").mock(
                return_value=httpx.Response(200, json=payload)
            )
            result = await client.get_scenarios()

        assert len(result) == 1
        assert result[0]["id"] == "7"

    async def test_401_raises_502(self, client):
        with respx.mock(base_url=BASE) as mock:
            mock.get("/publishes/scenarios").mock(
                return_value=httpx.Response(401)
            )
            with pytest.raises(Exception) as exc_info:
                await client.get_scenarios()
        assert exc_info.value.status_code == 502

    async def test_empty_list_returned(self, client):
        with respx.mock(base_url=BASE) as mock:
            mock.get("/publishes/scenarios").mock(
                return_value=httpx.Response(200, json=[])
            )
            result = await client.get_scenarios()

        assert result == []


@pytest.mark.asyncio
class TestTriggerPublishingJob:
    async def test_posts_per_document(self, client):
        """One POST to /files/{id}/publishes per document ID."""
        doc_ids = ["doc-1", "doc-2"]
        job_responses = [
            {"id": 101, "status": "submitted"},
            {"id": 102, "status": "submitted"},
        ]

        with respx.mock(base_url=BASE) as mock:
            mock.post("/files/doc-1/publishes").mock(
                return_value=httpx.Response(200, json=job_responses[0])
            )
            mock.post("/files/doc-2/publishes").mock(
                return_value=httpx.Response(200, json=job_responses[1])
            )
            results = await client.trigger_publishing_job(
                scenario_id="500009",
                deployment_id="dep-1",
                document_ids=doc_ids,
            )

        assert len(results) == 2
        assert results[0]["fileId"] == "doc-1"
        assert results[1]["fileId"] == "doc-2"

    async def test_scenario_sent_as_int(self, client):
        """The Heretto publish API requires scenario as an integer."""
        captured_body = {}

        def capture(request, route):
            captured_body.update(json.loads(request.content))
            return httpx.Response(200, json={"id": 1, "status": "submitted"})

        with respx.mock(base_url=BASE) as mock:
            mock.post("/files/doc-1/publishes").mock(side_effect=capture)
            await client.trigger_publishing_job(
                scenario_id="500009",
                deployment_id="dep-1",
                document_ids=["doc-1"],
            )

        assert captured_body["scenario"] == 500009

    async def test_empty_document_ids_raises(self, client):
        with pytest.raises(ValueError, match="At least one document"):
            await client.trigger_publishing_job(
                scenario_id="500009",
                deployment_id="dep-1",
                document_ids=[],
            )

    async def test_id_normalised_from_job_id_field(self, client):
        """Response may use jobId instead of id."""
        with respx.mock(base_url=BASE) as mock:
            mock.post("/files/doc-1/publishes").mock(
                return_value=httpx.Response(200, json={"jobId": 99, "status": "submitted"})
            )
            results = await client.trigger_publishing_job(
                scenario_id="500009",
                deployment_id="dep-1",
                document_ids=["doc-1"],
            )

        assert results[0]["id"] == "99"


@pytest.mark.asyncio
class TestGetPublishStatus:
    async def test_in_progress_has_no_result(self, client):
        body = {"jobId": "p1", "status": {"status": "IN_PROGRESS", "description": "", "result": None}}
        with respx.mock(base_url=BASE) as mock:
            mock.get("/files/f1/publishes/p1").mock(return_value=httpx.Response(200, json=body))
            out = await client.get_publish_status("f1", "p1")
        assert out == {"state": "IN_PROGRESS", "result": None, "message": ""}

    async def test_done_fail_carries_result_and_message(self, client):
        body = {"status": {"status": "DONE", "result": "FAIL", "description": "OT error"}}
        with respx.mock(base_url=BASE) as mock:
            mock.get("/files/f1/publishes/p1").mock(return_value=httpx.Response(200, json=body))
            out = await client.get_publish_status("f1", "p1")
        assert out == {"state": "DONE", "result": "FAIL", "message": "OT error"}

    async def test_404_raises_not_found(self, client):
        from fastapi import HTTPException
        with respx.mock(base_url=BASE) as mock:
            mock.get("/files/f1/publishes/p1").mock(return_value=httpx.Response(404))
            with pytest.raises(HTTPException) as exc:
                await client.get_publish_status("f1", "p1")
        assert exc.value.status_code == 404
