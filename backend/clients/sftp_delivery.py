"""SFTP delivery client — uploads a local file to a remote SFTP server."""

import asyncio
import base64
import binascii
import logging

import paramiko

logger = logging.getLogger(__name__)


def _parse_host_key(host_key_str: str) -> paramiko.PKey:
    """Parse an SSH public host key from 'keytype base64data' format.

    Accepts the single-line output of ssh-keyscan, e.g.:
        ssh-ed25519 AAAA...
        ssh-rsa AAAA...
        ecdsa-sha2-nistp256 AAAA...

    Raises ValueError on malformed input or unsupported key type.
    """
    parts = host_key_str.strip().split(None, 2)
    if len(parts) < 2:
        raise ValueError(
            "host_key must be in 'keytype base64data' format — "
            "obtain it with: ssh-keyscan -p PORT HOST"
        )
    key_type, b64 = parts[0], parts[1]
    try:
        data = base64.b64decode(b64)
    except (ValueError, binascii.Error) as exc:
        raise ValueError(f"host_key base64 data is malformed: {exc}") from exc

    try:
        if key_type == "ssh-rsa":
            return paramiko.RSAKey(data=data)
        if key_type == "ssh-ed25519":
            return paramiko.Ed25519Key(data=data)
        if key_type.startswith("ecdsa-sha2-"):
            return paramiko.ECDSAKey(data=data)
    except paramiko.SSHException as exc:
        raise ValueError(f"host_key cannot be parsed: {exc}") from exc

    raise ValueError(f"Unsupported host key type: {key_type!r}")


class SFTPDeliveryClient:
    """Delivers a file to an SFTP server using credentials from a config dict.

    Expected config keys: host, port (default 22), username, password,
    remote_path (directory on the server, default '/'), host_key (required —
    the server's public key in OpenSSH 'keytype base64data' format, obtained
    via ssh-keyscan).

    Host key verification is enforced: connections to servers whose key does
    not match the stored host_key are rejected.  This prevents MITM attacks on
    internet-facing deliveries.

    The upload runs in a thread pool so the asyncio event loop is not blocked.
    """

    def __init__(self, config: dict):
        self._host = config["host"]
        self._port = int(config.get("port", 22))
        self._username = config["username"]
        self._password = config["password"]
        self._remote_path = config.get("remote_path", "/").rstrip("/")
        host_key_str = config.get("host_key", "").strip()
        if not host_key_str:
            raise ValueError(
                "SFTP host_key is required. "
                "Obtain it with: ssh-keyscan -p PORT HOST"
            )
        self._host_key: paramiko.PKey = _parse_host_key(host_key_str)

    async def deliver(self, filename: str, local_path: str) -> None:
        await asyncio.wait_for(
            asyncio.to_thread(self._upload, filename, local_path),
            timeout=300,
        )

    def _upload(self, filename: str, local_path: str) -> None:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.RejectPolicy())
        ssh.get_host_keys().add(
            self._host,
            self._host_key.get_name(),
            self._host_key,
        )
        try:
            ssh.connect(
                hostname=self._host,
                port=self._port,
                username=self._username,
                password=self._password,
                timeout=30,
                banner_timeout=30,
                auth_timeout=30,
            )
            sftp = ssh.open_sftp()
            try:
                sftp.get_channel().settimeout(300)
                remote = f"{self._remote_path}/{filename}"
                sftp.put(local_path, remote)
                logger.info(
                    "SFTP: uploaded %s → %s:%s%s",
                    local_path, self._host, self._port, remote,
                )
            finally:
                sftp.close()
        finally:
            ssh.close()
