"""S3 delivery client — uploads a local file to an AWS S3 bucket."""

import asyncio
import logging

import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


class S3DeliveryClient:
    """Delivers a file to an S3 bucket using credentials from a config dict.

    Expected config keys: bucket, region, access_key_id, secret_access_key,
    prefix (optional key prefix / directory path, default '').

    The upload runs in a thread pool so the asyncio event loop is not blocked.
    """

    def __init__(self, config: dict):
        self._bucket = config["bucket"]
        self._prefix = config.get("prefix", "").strip("/")
        self._region = config.get("region")
        self._access_key_id = config["access_key_id"]
        self._secret_access_key = config["secret_access_key"]

    async def deliver(self, filename: str, local_path: str) -> None:
        await asyncio.to_thread(self._upload, filename, local_path)

    def _upload(self, filename: str, local_path: str) -> None:
        key = f"{self._prefix}/{filename}".lstrip("/") if self._prefix else filename
        try:
            s3 = boto3.client(
                "s3",
                region_name=self._region,
                aws_access_key_id=self._access_key_id,
                aws_secret_access_key=self._secret_access_key,
            )
            with open(local_path, "rb") as f:
                s3.put_object(Bucket=self._bucket, Key=key, Body=f)
            logger.info("S3: uploaded %s → s3://%s/%s", local_path, self._bucket, key)
        except (BotoCoreError, ClientError) as exc:
            raise RuntimeError(f"S3 upload failed: {exc}") from exc
