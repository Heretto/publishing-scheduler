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


# ── Fixtures for folder / release tests ───────────────────────────────────────

FOLDER_XML_MIXED = b"""<?xml version="1.0"?>
<resource id="folder-1">
  <children>
    <resource id="map-1" type="application/ditamap+xml" title="Map One" name="map1.ditamap"/>
    <resource id="topic-1" type="application/xml" title="Topic One" name="topic1.dita"/>
    <folder id="sub-1" name="Subfolder"/>
  </children>
</resource>
"""

FOLDER_XML_DITAMAP_BY_FILENAME = b"""<?xml version="1.0"?>
<resource id="folder-2">
  <children>
    <resource id="map-2" type="application/xml" title="guide.ditamap" name="guide.ditamap"/>
    <resource id="topic-2" type="application/xml" title="other.xml" name="other.xml"/>
  </children>
</resource>
"""

FOLDER_XML_EMPTY = b"""<?xml version="1.0"?>
<resource id="folder-3">
  <children/>
</resource>
"""

RELEASES_RESPONSE = {
    "releaseByFiles": {
        "release-uuid-1": {
            "id": "snapshot-uuid-1",
            "name": "guide.ditamap",
            "created": 1742413662478,
        },
        "release-uuid-2": {
            "id": "snapshot-uuid-2",
            "name": "guide.ditamap",
            "created": 1700000000000,
        },
    },
    "releases": [
        {
            "id": "release-uuid-1",
            "name": "Loosey Goosey Revision",
            "completedDateTime": "2025-03-19T10:00:00.000Z",
            "branchOfOriginName": "master",
        },
        {
            "id": "release-uuid-2",
            "name": "First Draft",
            "completedDateTime": "2023-11-14T00:00:00.000Z",
            "branchOfOriginName": "master",
        },
    ],
}


@pytest.mark.asyncio
class TestGetDitamapsInFolder:
    async def test_returns_only_ditamaps_by_type(self, ccms):
        """Non-ditamap files and subfolders must be excluded."""
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/folder-1").mock(
                return_value=httpx.Response(200, content=FOLDER_XML_MIXED)
            )
            result = await ccms.get_ditamaps_in_folder("folder-1")

        ids = [r["id"] for r in result]
        assert "map-1" in ids
        assert "topic-1" not in ids
        assert "sub-1" not in ids

    async def test_skips_subfolders(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/folder-1").mock(
                return_value=httpx.Response(200, content=FOLDER_XML_MIXED)
            )
            result = await ccms.get_ditamaps_in_folder("folder-1")

        types = [r.get("type", "").lower() for r in result]
        assert "folder" not in types

    async def test_detects_ditamap_by_filename_extension(self, ccms):
        """A file typed application/xml but named *.ditamap must be included."""
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/folder-2").mock(
                return_value=httpx.Response(200, content=FOLDER_XML_DITAMAP_BY_FILENAME)
            )
            result = await ccms.get_ditamaps_in_folder("folder-2")

        ids = [r["id"] for r in result]
        assert "map-2" in ids
        assert "topic-2" not in ids

    async def test_empty_folder_returns_empty_list(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/folder-3").mock(
                return_value=httpx.Response(200, content=FOLDER_XML_EMPTY)
            )
            result = await ccms.get_ditamaps_in_folder("folder-3")

        assert result == []

    async def test_result_contains_id_and_title(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/folder-1").mock(
                return_value=httpx.Response(200, content=FOLDER_XML_MIXED)
            )
            result = await ccms.get_ditamaps_in_folder("folder-1")

        assert len(result) == 1
        assert result[0]["id"] == "map-1"
        assert result[0]["title"] == "Map One"


@pytest.mark.asyncio
class TestGetReleasesForDocument:
    async def test_returns_named_releases(self, ccms):
        """Release names from the releases[] array must appear in results."""
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1/releases").mock(
                return_value=httpx.Response(200, json=RELEASES_RESPONSE)
            )
            result = await ccms.get_releases_for_document("doc-1")

        names = [r["name"] for r in result]
        assert "Loosey Goosey Revision" in names
        assert "First Draft" in names

    async def test_uses_snapshot_id_not_release_uuid(self, ccms):
        """The id field must be the snapshot file UUID, not the release UUID key."""
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1/releases").mock(
                return_value=httpx.Response(200, json=RELEASES_RESPONSE)
            )
            result = await ccms.get_releases_for_document("doc-1")

        ids = {r["id"] for r in result}
        assert "snapshot-uuid-1" in ids
        assert "snapshot-uuid-2" in ids
        assert "release-uuid-1" not in ids
        assert "release-uuid-2" not in ids

    async def test_sorted_newest_first(self, ccms):
        """Results must be sorted by completedDateTime descending."""
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1/releases").mock(
                return_value=httpx.Response(200, json=RELEASES_RESPONSE)
            )
            result = await ccms.get_releases_for_document("doc-1")

        dates = [r["completedDateTime"] for r in result]
        assert dates == sorted(dates, reverse=True)

    async def test_includes_branch_of_origin(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1/releases").mock(
                return_value=httpx.Response(200, json=RELEASES_RESPONSE)
            )
            result = await ccms.get_releases_for_document("doc-1")

        assert all(r["branchOfOriginName"] == "master" for r in result)

    async def test_empty_releases_returns_empty_list(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1/releases").mock(
                return_value=httpx.Response(200, json={"releaseByFiles": {}, "releases": []})
            )
            result = await ccms.get_releases_for_document("doc-1")

        assert result == []

    async def test_release_not_in_releaseByFiles_falls_back_to_release_id(self, ccms):
        """If a release UUID has no entry in releaseByFiles, its own UUID is used."""
        sparse = {
            "releaseByFiles": {},  # no snapshot entries
            "releases": [
                {
                    "id": "release-uuid-only",
                    "name": "Orphan Release",
                    "completedDateTime": "2024-01-01T00:00:00.000Z",
                    "branchOfOriginName": "master",
                }
            ],
        }
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/doc-1/releases").mock(
                return_value=httpx.Response(200, json=sparse)
            )
            result = await ccms.get_releases_for_document("doc-1")

        assert len(result) == 1
        assert result[0]["id"] == "release-uuid-only"
        assert result[0]["name"] == "Orphan Release"

    async def test_404_raises_exception(self, ccms):
        with respx.mock(base_url=REST_BASE) as mock:
            mock.get("/all-files/no-such/releases").mock(
                return_value=httpx.Response(404)
            )
            with pytest.raises(Exception) as exc_info:
                await ccms.get_releases_for_document("no-such")
        assert exc_info.value.status_code == 404
