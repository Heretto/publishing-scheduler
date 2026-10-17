"""Tests for services.heretto_connection — the organization's Heretto connection."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from services.heretto_connection import (
    NO_CONNECTION_MESSAGE,
    NoHerettoConnection,
    _host,
    get_heretto_connection,
    org_heretto_connection,
)

PAYLOAD = {"server_url": "https://acme.heretto.com/", "username": "pat", "token": "tok-123"}


def _credential(name="Acme", id_="cred-1"):
    c = MagicMock()
    c.id = id_
    c.name = name
    c.encrypted_data = b"encrypted"
    return c


def _lookup(credentials, payloads=None):
    """Patch the org's connection list and decryption."""
    decrypt = MagicMock(side_effect=payloads) if payloads else MagicMock(return_value=PAYLOAD)
    return (
        patch("services.heretto_connection.heretto_connections", return_value=credentials),
        patch("services.heretto_connection.decrypt_credentials", decrypt),
    )


class TestHost:
    @pytest.mark.parametrize("server_url, host", [
        ("https://acme.heretto.com", "acme.heretto.com"),
        ("https://Acme.Heretto.com/", "acme.heretto.com"),
        ("acme.heretto.com", "acme.heretto.com"),
        ("https://cms.acme.com/some/path", "cms.acme.com"),
        ("", ""),
    ])
    def test_host_from_server_url(self, server_url, host):
        assert _host(server_url) == host


class TestGetHerettoConnection:
    def test_no_connection_raises(self):
        a, b = _lookup([])
        with a, b, pytest.raises(NoHerettoConnection, match="Add one under Credentials"):
            get_heretto_connection("org-1", MagicMock())

    def test_single_connection(self):
        a, b = _lookup([_credential()])
        with a, b:
            conn = get_heretto_connection("org-1", MagicMock())
        assert (conn.id, conn.name, conn.host) == ("cred-1", "Acme", "acme.heretto.com")
        assert conn.auth == ("pat", "tok-123")
        assert conn.api_base_url == "https://acme.heretto.com/ezdnxtgen/api/v2"
        assert conn.ccms_base_url == "https://acme.heretto.com/rest"
        assert conn.search_base_url == "https://acme.heretto.com/ezdnxtgen/api"

    def test_several_connections_uses_first_by_name(self):
        # heretto_connections returns them ordered by name
        a, b = _lookup([_credential("Alpha", "cred-a"), _credential("Beta", "cred-b")])
        with a, b:
            assert get_heretto_connection("org-1", MagicMock()).id == "cred-a"

    def test_unreadable_connection_raises(self):
        a, b = _lookup([_credential()], payloads=ValueError("bad key"))
        with a, b, pytest.raises(NoHerettoConnection, match="can't be read"):
            get_heretto_connection("org-1", MagicMock())

    def test_incomplete_connection_raises(self):
        a, b = _lookup([_credential()], payloads=[{"server_url": "https://acme.heretto.com", "username": "pat"}])
        with a, b, pytest.raises(NoHerettoConnection, match="incomplete"):
            get_heretto_connection("org-1", MagicMock())

    def test_org_setting_overrides_host_label(self, mock_settings):
        a, b = _lookup([_credential()])
        with a, b:
            conn = get_heretto_connection("org-1", MagicMock())
        mock_settings.heretto_org = "jorsek"
        assert conn.org == "jorsek"
        mock_settings.heretto_org = ""
        assert conn.org == "acme"


class TestRouteDependency:
    def test_missing_connection_is_409_with_message(self):
        ctx = MagicMock(organization_id="org-1")
        with patch("services.heretto_connection.heretto_connections", return_value=[]):
            with pytest.raises(HTTPException) as exc:
                org_heretto_connection(ctx, MagicMock())
        assert exc.value.status_code == 409
        assert exc.value.detail == NO_CONNECTION_MESSAGE
