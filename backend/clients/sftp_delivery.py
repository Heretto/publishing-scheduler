"""SFTP delivery client — uploads a local file to a remote SFTP server."""

import asyncio
import logging

import paramiko

logger = logging.getLogger(__name__)


class SFTPDeliveryClient:
    """Delivers a file to an SFTP server using credentials from a config dict.

    Expected config keys: host, port (default 22), username, password,
    remote_path (directory on the server, default '/').

    The upload runs in a thread pool so the asyncio event loop is not blocked.

    NOTE: Host key verification uses AutoAddPolicy for V1 convenience.  This
    accepts any host key on first connect and does not verify against a known-
    hosts store, which means MITM attacks on the connection are not detected.
    Customers deploying in security-sensitive environments should be aware of
    this limitation.
    """

    def __init__(self, config: dict):
        self._host = config["host"]
        self._port = int(config.get("port", 22))
        self._username = config["username"]
        self._password = config["password"]
        self._remote_path = config.get("remote_path", "/").rstrip("/")

    async def deliver(self, filename: str, local_path: str) -> None:
        await asyncio.to_thread(self._upload, filename, local_path)

    def _upload(self, filename: str, local_path: str) -> None:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
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
                remote = f"{self._remote_path}/{filename}"
                sftp.put(local_path, remote)
                logger.info("SFTP: uploaded %s → %s:%s%s", local_path, self._host, self._port, remote)
            finally:
                sftp.close()
        finally:
            ssh.close()
