"""Tests for SFTPDeliveryClient."""

import pytest
from unittest.mock import MagicMock, patch, call


class TestSFTPDeliveryClientInit:
    def _make_config(self, **overrides):
        base = {
            "host": "sftp.example.com",
            "port": 22,
            "username": "user",
            "password": "secret",
            "remote_path": "/uploads",
        }
        base.update(overrides)
        return base

    def test_defaults_applied(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        client = SFTPDeliveryClient({"host": "h", "username": "u", "password": "p"})
        assert client._port == 22
        assert client._remote_path == ""  # "/" stripped by rstrip("/")

    def test_port_coerced_from_string(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        client = SFTPDeliveryClient(self._make_config(port="2222"))
        assert client._port == 2222

    def test_remote_path_trailing_slash_stripped(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        client = SFTPDeliveryClient(self._make_config(remote_path="/uploads/"))
        assert client._remote_path == "/uploads"

    def test_attributes_set(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        client = SFTPDeliveryClient(self._make_config())
        assert client._host == "sftp.example.com"
        assert client._username == "user"
        assert client._password == "secret"


class TestSFTPDeliveryClientUpload:
    def _make_client(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        return SFTPDeliveryClient({
            "host": "sftp.example.com",
            "port": 22,
            "username": "user",
            "password": "secret",
            "remote_path": "/uploads",
        })

    def test_upload_calls_sftp_put(self):
        client = self._make_client()
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

    def test_sftp_close_called_even_on_error(self):
        client = self._make_client()
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
        client = self._make_client()
        mock_ssh = MagicMock()
        mock_ssh.connect.side_effect = OSError("refused")

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh):
            with pytest.raises(OSError):
                client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_ssh.close.assert_called_once()

    def test_auto_add_policy_set(self):
        client = self._make_client()
        mock_ssh = MagicMock()
        mock_ssh.open_sftp.return_value = MagicMock()

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh), \
             patch("clients.sftp_delivery.paramiko.AutoAddPolicy") as MockPolicy:
            client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_ssh.set_missing_host_key_policy.assert_called_once_with(MockPolicy.return_value)

    def test_remote_path_constructed_correctly(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        client = SFTPDeliveryClient({
            "host": "h", "username": "u", "password": "p",
            "remote_path": "/out/dir",
        })
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
        })
        mock_ssh = MagicMock()
        mock_sftp = MagicMock()
        mock_ssh.open_sftp.return_value = mock_sftp

        with patch("clients.sftp_delivery.paramiko.SSHClient", return_value=mock_ssh):
            client._upload("my.zip", "/tmp/my.zip")

        # _remote_path is "" after stripping "/", so remote = "/my.zip"
        mock_sftp.put.assert_called_once_with("/tmp/my.zip", "/my.zip")


@pytest.mark.asyncio
class TestSFTPDeliveryClientDeliver:
    async def test_deliver_calls_upload_in_thread(self):
        from clients.sftp_delivery import SFTPDeliveryClient
        client = SFTPDeliveryClient({
            "host": "h", "username": "u", "password": "p",
        })
        with patch.object(client, "_upload") as mock_upload, \
             patch("asyncio.to_thread", side_effect=lambda fn, *a, **kw: fn(*a, **kw)):
            await client.deliver("bundle.zip", "/tmp/bundle.zip")

        mock_upload.assert_called_once_with("bundle.zip", "/tmp/bundle.zip")
