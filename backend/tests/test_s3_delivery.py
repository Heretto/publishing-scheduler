"""Tests for S3DeliveryClient."""

import pytest
from unittest.mock import MagicMock, mock_open, patch
from botocore.exceptions import ClientError


class TestS3DeliveryClientInit:
    def _make_config(self, **overrides):
        base = {
            "bucket": "my-bucket",
            "prefix": "pub/",
            "region": "us-east-1",
            "access_key_id": "AKID",
            "secret_access_key": "SECRET",
        }
        base.update(overrides)
        return base

    def test_attributes_set(self):
        from clients.s3_delivery import S3DeliveryClient
        client = S3DeliveryClient(self._make_config())
        assert client._bucket == "my-bucket"
        assert client._region == "us-east-1"
        assert client._access_key_id == "AKID"
        assert client._secret_access_key == "SECRET"

    def test_prefix_trailing_slash_stripped(self):
        from clients.s3_delivery import S3DeliveryClient
        client = S3DeliveryClient(self._make_config(prefix="pub/"))
        assert client._prefix == "pub"

    def test_prefix_defaults_to_empty(self):
        from clients.s3_delivery import S3DeliveryClient
        config = self._make_config()
        del config["prefix"]
        client = S3DeliveryClient(config)
        assert client._prefix == ""

    def test_region_defaults_to_none(self):
        from clients.s3_delivery import S3DeliveryClient
        config = self._make_config()
        del config["region"]
        client = S3DeliveryClient(config)
        assert client._region is None


class TestS3DeliveryClientUpload:
    def _make_client(self, prefix="pub"):
        from clients.s3_delivery import S3DeliveryClient
        return S3DeliveryClient({
            "bucket": "my-bucket",
            "prefix": prefix,
            "region": "us-east-1",
            "access_key_id": "AKID",
            "secret_access_key": "SECRET",
        })

    def test_upload_calls_put_object(self):
        client = self._make_client()
        mock_s3 = MagicMock()

        with patch("clients.s3_delivery.boto3.client", return_value=mock_s3), \
             patch("builtins.open", mock_open(read_data=b"zip-bytes")):
            client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_s3.put_object.assert_called_once()
        call_kwargs = mock_s3.put_object.call_args.kwargs
        assert call_kwargs["Bucket"] == "my-bucket"
        assert call_kwargs["Key"] == "pub/bundle.zip"

    def test_key_no_prefix(self):
        client = self._make_client(prefix="")
        mock_s3 = MagicMock()

        with patch("clients.s3_delivery.boto3.client", return_value=mock_s3), \
             patch("builtins.open", mock_open(read_data=b"")):
            client._upload("bundle.zip", "/tmp/bundle.zip")

        call_kwargs = mock_s3.put_object.call_args.kwargs
        assert call_kwargs["Key"] == "bundle.zip"

    def test_boto3_client_created_with_correct_credentials(self):
        client = self._make_client()
        mock_s3 = MagicMock()

        with patch("clients.s3_delivery.boto3.client", return_value=mock_s3) as mock_boto, \
             patch("builtins.open", mock_open(read_data=b"")):
            client._upload("bundle.zip", "/tmp/bundle.zip")

        mock_boto.assert_called_once_with(
            "s3",
            region_name="us-east-1",
            aws_access_key_id="AKID",
            aws_secret_access_key="SECRET",
        )

    def test_client_error_wrapped_in_runtime_error(self):
        client = self._make_client()
        mock_s3 = MagicMock()
        mock_s3.put_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchBucket", "Message": "bucket missing"}},
            "PutObject",
        )

        with patch("clients.s3_delivery.boto3.client", return_value=mock_s3), \
             patch("builtins.open", mock_open(read_data=b"")):
            with pytest.raises(RuntimeError, match="S3 upload failed"):
                client._upload("bundle.zip", "/tmp/bundle.zip")

    def test_nested_prefix_key(self):
        from clients.s3_delivery import S3DeliveryClient
        client = S3DeliveryClient({
            "bucket": "b", "prefix": "a/b/c",
            "region": "eu-west-1",
            "access_key_id": "K", "secret_access_key": "S",
        })
        mock_s3 = MagicMock()

        with patch("clients.s3_delivery.boto3.client", return_value=mock_s3), \
             patch("builtins.open", mock_open(read_data=b"")):
            client._upload("out.zip", "/tmp/out.zip")

        key = mock_s3.put_object.call_args.kwargs["Key"]
        assert key == "a/b/c/out.zip"


@pytest.mark.asyncio
class TestS3DeliveryClientDeliver:
    async def test_deliver_calls_upload_in_thread(self):
        from clients.s3_delivery import S3DeliveryClient
        client = S3DeliveryClient({
            "bucket": "b", "region": "us-east-1",
            "access_key_id": "K", "secret_access_key": "S",
        })
        with patch.object(client, "_upload") as mock_upload, \
             patch("asyncio.to_thread", side_effect=lambda fn, *a, **kw: fn(*a, **kw)):
            await client.deliver("bundle.zip", "/tmp/bundle.zip")

        mock_upload.assert_called_once_with("bundle.zip", "/tmp/bundle.zip")
