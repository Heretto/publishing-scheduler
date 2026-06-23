"""Tests for HerettoCcmsClient — locale discovery and XML parsing."""

import pytest
import respx
import httpx
from unittest.mock import AsyncMock, patch

from clients.heretto_ccms import HerettoCcmsClient


REST_BASE = "https://test.heretto.com/rest"

DOC_XML_WITH_LOCALES = b"""<?xml version="1.0"?>
<resource id="doc-1" title="My Doc">
  <metadata>
    <meta name="lang_fr-fr">uuid-fr-0001</meta>
    <meta name="lang_de-de">uuid-de-0001</meta>
    <meta name="author">Jane</meta>
  </metadata>
</resource>
"""

DOC_XML_NO_METADATA = b"""<?xml version="1.0"?>
<resource id="doc-2" title="No Meta Doc">
</resource>
"""

DOC_XML_NO_LANG_METAS = b"""<?xml version="1.0"?>
<resource id="doc-3" title="Other Meta">
  <metadata>
    <meta name="author">Bob</meta>
    <meta name="version">1.0</meta>
  </metadata>
</resource>
"""

DOC_XML_ONLY_FR = b"""<?xml version="1.0"?>
<resource id="doc-4" title="FR Only">
  <metadata>
    <meta name="lang_fr-fr">uuid-fr-0002</meta>
  </metadata>
</resource>
"""


@pytest.fixture
def ccms(mock_settings):
    mock_settings.heretto_ccms_base_url = REST_BASE
    return HerettoCcmsClient()


@pytest.mark.asyncio
class TestGetDocumentLocales:
    async def test_returns_lang_metas(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1").mock(
                return_value=httpx.Response(200, content=DOC_XML_WITH_LOCALES)
            )
            result = await ccms.get_document_locales("doc-1")

        assert len(result) == 2
        codes = {r["code"] for r in result}
        assert codes == {"fr-fr", "de-de"}

    async def test_returns_uuid_for_each_locale(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1").mock(
                return_value=httpx.Response(200, content=DOC_XML_WITH_LOCALES)
            )
            result = await ccms.get_document_locales("doc-1")

        fr = next(r for r in result if r["code"] == "fr-fr")
        assert fr["uuid"] == "uuid-fr-0001"

    async def test_no_metadata_element_returns_empty(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-2").mock(
                return_value=httpx.Response(200, content=DOC_XML_NO_METADATA)
            )
            result = await ccms.get_document_locales("doc-2")

        assert result == []

    async def test_metadata_without_lang_metas_returns_empty(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-3").mock(
                return_value=httpx.Response(200, content=DOC_XML_NO_LANG_METAS)
            )
            result = await ccms.get_document_locales("doc-3")

        assert result == []

    async def test_non_lang_metas_ignored(self, ccms):
        """'author' and other meta elements must not appear in result."""
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1").mock(
                return_value=httpx.Response(200, content=DOC_XML_WITH_LOCALES)
            )
            result = await ccms.get_document_locales("doc-1")

        assert all(r["code"] != "author" for r in result)

    async def test_404_raises_http_exception(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/missing").mock(
                return_value=httpx.Response(404)
            )
            with pytest.raises(Exception) as exc_info:
                await ccms.get_document_locales("missing")
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
class TestGetLocalesForDocuments:
    async def test_empty_input_returns_empty(self, ccms):
        result = await ccms.get_locales_for_documents([])
        assert result == []

    async def test_single_doc_returns_all_its_locales(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1").mock(
                return_value=httpx.Response(200, content=DOC_XML_WITH_LOCALES)
            )
            result = await ccms.get_locales_for_documents(["doc-1"])

        codes = [r["code"] for r in result]
        assert "fr-fr" in codes
        assert "de-de" in codes

    async def test_intersection_of_two_docs(self, ccms):
        """doc-1 has fr+de; doc-4 has only fr → intersection is [fr]."""
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1").mock(
                return_value=httpx.Response(200, content=DOC_XML_WITH_LOCALES)
            )
            mock.get("/all-files/doc-4").mock(
                return_value=httpx.Response(200, content=DOC_XML_ONLY_FR)
            )
            result = await ccms.get_locales_for_documents(["doc-1", "doc-4"])

        assert len(result) == 1
        assert result[0]["code"] == "fr-fr"

    async def test_no_common_locales_returns_empty(self, ccms):
        """doc-3 has no lang metas → intersection with anything is empty."""
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1").mock(
                return_value=httpx.Response(200, content=DOC_XML_WITH_LOCALES)
            )
            mock.get("/all-files/doc-3").mock(
                return_value=httpx.Response(200, content=DOC_XML_NO_LANG_METAS)
            )
            result = await ccms.get_locales_for_documents(["doc-1", "doc-3"])

        assert result == []

    async def test_result_sorted_by_code(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1").mock(
                return_value=httpx.Response(200, content=DOC_XML_WITH_LOCALES)
            )
            result = await ccms.get_locales_for_documents(["doc-1"])

        codes = [r["code"] for r in result]
        assert codes == sorted(codes)

    async def test_result_contains_only_code_field(self, ccms):
        """UUID is internal; only 'code' should be exposed."""
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1").mock(
                return_value=httpx.Response(200, content=DOC_XML_WITH_LOCALES)
            )
            result = await ccms.get_locales_for_documents(["doc-1"])

        for item in result:
            assert set(item.keys()) == {"code"}
