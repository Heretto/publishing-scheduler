"""Tests for SFTPDeliveryClient and _parse_host_key."""

import base64
import pytest
import paramiko
from unittest.mock import MagicMock, patch


def _generate_test_host_key() -> str:
    """Return a valid 'ssh-rsa base64' string using a freshly generated 1024-bit key."""
    key = paramiko.RSAKey.generate(1024)
    return f"ssh-rsa {base64.b64encode(key.asbytes()).decode()}"


# Single key reused across all tests — generated once at import time.
_TEST_HOST_KEY = _generate_test_host_key()


def _make_config(**overrides):
    base = {
        "host": "sftp.example.com",
        "port": 22,
        "username": "user",
        "password": "secret",
        "remote_path": "/uploads",
        "host_key": _TEST_HOST_KEY,
    }
    base.update(overrides)
    return base


def _make_client(**overrides):
    from clients.sftp_delivery import SFTPDeliveryClient
    return SFTPDeliveryClient(_make_config(**overrides))


# ── _parse_host_key ────────────────────────────────────────────────────────────

class TestParseHostKey:
    def test_valid_rsa_key_returns_pkey(self):
        from clients.sftp_delivery import _parse_host_key
        result = _parse_host_key(_TEST_HOST_KEY)
        assert isinstance(result, paramiko.RSAKey)

    def test_missing_base64_raises_value_error(self):
        from clients.sftp_delivery import _parse_host_key
        with pytest.raises(ValueError, match="keytype base64data"):
            _parse_host_key("ssh-ed25519")

    def test_empty_string_raises_value_error(self):
        from clients.sftp_delivery import _parse_host_key
        with pytest.raises(ValueError):
            _parse_host_key("")

    def test_malformed_base64_raises_value_error(self):
        from clients.sftp_delivery import _parse_host_key
        with pytest.raises(ValueError, match="malformed"):
            _parse_host_key("ssh-ed25519 !!!not-base64!!!")

    def test_unsupported_key_type_raises_value_error(self):
        from clients.sftp_delivery import _parse_host_key
        with pytest.raises(ValueError, match="Unsupported host key type"):
            _parse_host_key("ssh-dss AAAA")

    def test_leading_trailing_whitespace_stripped(self):
        from clients.sftp_delivery import _parse_host_key
        result = _parse_host_key(f"  {_TEST_HOST_KEY}  \n")
        assert isinstance(result, paramiko.RSAKey)

    def test_ssh_keyscan_comment_part_ignored(self):
        """ssh-keyscan output often has 'host keytype base64 comment' — third part ignored."""
        from clients.sftp_delivery import _parse_host_key
        result = _parse_host_key(f"{_TEST_HOST_KEY} optional-comment")
        assert isinstance(result, paramiko.RSAKey)


# ── SFTPDeliveryClient.__init__ ────────────────────────────────────────────────

class TestSFTPDeliveryClientInit:
    def test_defaults_applied(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        client = SFTPDeliveryClient({
            "host": "h", "username": "u", "password": "p",
            "host_key": _TEST_HOST_KEY,
        })
        assert client._port == 22
        assert client._remote_path == ""  # "/" stripped by rstrip("/")

    def test_missing_host_key_raises(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        with pytest.raises(ValueError, match="host_key is required"):
            SFTPDeliveryClient({"host": "h", "username": "u", "password": "p"})

    def test_empty_host_key_raises(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        with pytest.raises(ValueError, match="host_key is required"):
            SFTPDeliveryClient({
                "host": "h", "username": "u", "password": "p", "host_key": "   ",
            })

    def test_invalid_host_key_raises(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        with pytest.raises(ValueError):
            SFTPDeliveryClient({
                "host": "h", "username": "u", "password": "p",
                "host_key": "not-a-valid-key",
            })

    def test_port_coerced_from_string(self):
        client = _make_client(port="2222")
        assert client._port == 2222

    def test_remote_path_trailing_slash_stripped(self):
        client = _make_client(remote_path="/uploads/")
        assert client._remote_path == "/uploads"

    def test_attributes_set(self):
        client = _make_client()
        assert client._host == "sftp.example.com"
        assert client._username == "user"
        assert client._password == "secret"

    def test_host_key_parsed_and_stored(self):
        client = _make_client()
        assert isinstance(client._host_key, paramiko.RSAKey)


# ── SFTPDeliveryClient._upload ─────────────────────────────────────────────────

class TestSFTPDeliveryClientUpload:
    def test_upload_calls_sftp_put(self):
        client = _make_client()
        mock_ssh = MagicMock()
        mock_sftp = MagicMock()
        mock_ssh.open_sftp.return_value = mock_sftp

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh):
            client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_ssh.connect.assert_called_once_with(
            hostname="sftp.example.com",
            port=22,
            username="user",
            password="secret",
            timeout=30,
            banner_timeout=30,
            auth_timeout=30,
        )
        mock_sftp.put.assert_called_once_with("/tmp/bundle.zip", "/uploads/bundle.zip")

    def test_reject_policy_used_not_auto_add(self):
        client = _make_client()
        mock_ssh = MagicMock()
        mock_ssh.open_sftp.return_value = MagicMock()

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh), \
             patch("clients.sftp_delivery.paramiko.RejectPolicy") as MockReject:
            client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_ssh.set_missing_host_key_policy.assert_called_once_with(MockReject.return_value)

    def test_host_key_loaded_into_known_hosts(self):
        client = _make_client()
        mock_ssh = MagicMock()
        mock_host_keys = MagicMock()
        mock_ssh.get_host_keys.return_value = mock_host_keys
        mock_ssh.open_sftp.return_value = MagicMock()

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh):
            client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_host_keys.add.assert_called_once_with(
            "sftp.example.com",
            client._host_key.get_name(),
            client._host_key,
        )

    def test_sftp_close_called_even_on_error(self):
        client = _make_client()
        mock_ssh = MagicMock()
        mock_sftp = MagicMock()
        mock_sftp.put.side_effect = OSError("connection reset")
        mock_ssh.open_sftp.return_value = mock_sftp

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh):
            with pytest.raises(OSError):
                client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_sftp.close.assert_called_once()
        mock_ssh.close.assert_called_once()

    def test_ssh_close_called_even_on_connect_error(self):
        client = _make_client()
        mock_ssh = MagicMock()
        mock_ssh.connect.side_effect = OSError("refused")

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh):
            with pytest.raises(OSError):
                client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_ssh.close.assert_called_once()

    def test_channel_timeout_set(self):
        client = _make_client()
        mock_ssh = MagicMock()
        mock_sftp = MagicMock()
        mock_channel = MagicMock()
        mock_sftp.get_channel.return_value = mock_channel
        mock_ssh.open_sftp.return_value = mock_sftp

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh):
            client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_channel.settimeout.assert_called_once_with(300)

    def test_remote_path_constructed_correctly(self):
        client = _make_client(remote_path="/out/dir")
        mock_ssh = MagicMock()
        mock_sftp = MagicMock()
        mock_ssh.open_sftp.return_value = mock_sftp

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh):
            client._upload("my.zip", "/tmp/my.zip")

        mock_sftp.put.assert_called_once_with("/tmp/my.zip", "/out/dir/my.zip")

    def test_no_remote_path_uses_root(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        client = SFTPDeliveryClient({
            "host": "h", "username": "u", "password": "p",
            "host_key": _TEST_HOST_KEY,
        })
        mock_ssh = MagicMock()
        mock_sftp = MagicMock()
        mock_ssh.open_sftp.return_value = mock_sftp

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh):
            client._upload("my.zip", "/tmp/my.zip")

        mock_sftp.put.assert_called_once_with("/tmp/my.zip", "/my.zip")


# ── SFTPDeliveryClient.deliver ─────────────────────────────────────────────────

@pytest.mark.asyncio
class TestSFTPDeliveryClientDeliver:
    async def test_deliver_runs_upload_in_thread(self):
        client = _make_client()
        with patch.object(client, "_upload") as mock_upload:
            await client.deliver("bundle.zip", "/tmp/bundle.zip")
        mock_upload.assert_called_once_with("bundle.zip", "/tmp/bundle.zip")
