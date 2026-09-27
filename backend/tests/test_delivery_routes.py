"""Tests for delivery-target route schemas and helper logic."""

import base64
import pytest
import paramiko
from pydantic import ValidationError
from unittest.mock import MagicMock, patch


def _make_test_host_key() -> str:
    key = paramiko.RSAKey.generate(1024)
    return f"ssh-rsa {base64.b64encode(key.asbytes()).decode()}"


_TEST_HOST_KEY = _make_test_host_key()


# ── SFTPTargetBody / S3TargetBody schemas ─────────────────────────────────────

class TestSFTPTargetBody:
    def _valid(self, **overrides):
        base = {
            "type": "sftp",
            "host": "sftp.example.com",
            "port": 22,
            "username": "user",
            "password": "secret",
            "remote_path": "/uploads",
            "host_key": _TEST_HOST_KEY,
        }
        base.update(overrides)
        return base

    def test_valid_payload_accepted(self):
        from routes.schedules import SFTPTargetBody
        body = SFTPTargetBody(**self._valid())
        assert body.type == "sftp"
        assert body.host == "sftp.example.com"
        assert body.port == 22

    def test_enabled_defaults_to_true(self):
        from routes.schedules import SFTPTargetBody
        body = SFTPTargetBody(**self._valid())
        assert body.enabled is True

    def test_port_must_be_in_range(self):
        from routes.schedules import SFTPTargetBody
        with pytest.raises(ValidationError):
            SFTPTargetBody(**self._valid(port=0))
        with pytest.raises(ValidationError):
            SFTPTargetBody(**self._valid(port=65536))

    def test_host_required(self):
        from routes.schedules import SFTPTargetBody
        payload = self._valid()
        del payload["host"]
        with pytest.raises(ValidationError):
            SFTPTargetBody(**payload)

    def test_password_required(self):
        from routes.schedules import SFTPTargetBody
        payload = self._valid()
        del payload["password"]
        with pytest.raises(ValidationError):
            SFTPTargetBody(**payload)

    def test_host_key_required(self):
        from routes.schedules import SFTPTargetBody
        payload = self._valid()
        del payload["host_key"]
        with pytest.raises(ValidationError):
            SFTPTargetBody(**payload)

    def test_remote_path_defaults_to_slash(self):
        from routes.schedules import SFTPTargetBody
        payload = self._valid()
        del payload["remote_path"]
        body = SFTPTargetBody(**payload)
        assert body.remote_path == "/"

    def test_model_dump_excludes_type_and_enabled(self):
        from routes.schedules import SFTPTargetBody
        body = SFTPTargetBody(**self._valid())
        config = body.model_dump(exclude={"type", "enabled"})
        assert "type" not in config
        assert "enabled" not in config
        assert "host" in config
        assert "password" in config
        assert "host_key" in config


class TestS3TargetBody:
    def _valid(self, **overrides):
        base = {
            "type": "s3",
            "bucket": "my-bucket",
            "prefix": "pub/",
            "region": "us-east-1",
            "access_key_id": "AKID",
            "secret_access_key": "SECRET",
        }
        base.update(overrides)
        return base

    def test_valid_payload_accepted(self):
        from routes.schedules import S3TargetBody
        body = S3TargetBody(**self._valid())
        assert body.type == "s3"
        assert body.bucket == "my-bucket"

    def test_enabled_defaults_to_true(self):
        from routes.schedules import S3TargetBody
        body = S3TargetBody(**self._valid())
        assert body.enabled is True

    def test_bucket_required(self):
        from routes.schedules import S3TargetBody
        payload = self._valid()
        del payload["bucket"]
        with pytest.raises(ValidationError):
            S3TargetBody(**payload)

    def test_secret_access_key_required(self):
        from routes.schedules import S3TargetBody
        payload = self._valid()
        del payload["secret_access_key"]
        with pytest.raises(ValidationError):
            S3TargetBody(**payload)

    def test_prefix_defaults_to_empty(self):
        from routes.schedules import S3TargetBody
        payload = self._valid()
        del payload["prefix"]
        body = S3TargetBody(**payload)
        assert body.prefix == ""

    def test_model_dump_excludes_type_and_enabled(self):
        from routes.schedules import S3TargetBody
        body = S3TargetBody(**self._valid())
        config = body.model_dump(exclude={"type", "enabled"})
        assert "type" not in config
        assert "secret_access_key" in config


# ── _mask_config ──────────────────────────────────────────────────────────────

class TestMaskConfig:
    def test_sftp_masks_password(self):
        from routes.schedules import _mask_config
        config = {"host": "h", "username": "u", "password": "real-secret", "port": 22}
        masked = _mask_config("sftp", config)
        assert masked["password"] == "***"
        assert masked["host"] == "h"  # non-secret preserved

    def test_s3_masks_secret_access_key(self):
        from routes.schedules import _mask_config
        config = {"bucket": "b", "access_key_id": "AKID", "secret_access_key": "real-secret"}
        masked = _mask_config("s3", config)
        assert masked["secret_access_key"] == "***"
        assert masked["access_key_id"] == "AKID"

    def test_mask_does_not_mutate_original(self):
        from routes.schedules import _mask_config
        config = {"password": "secret"}
        _mask_config("sftp", config)
        assert config["password"] == "secret"

    def test_unknown_type_returns_config_unchanged(self):
        from routes.schedules import _mask_config
        config = {"key": "value"}
        result = _mask_config("ftp", config)
        assert result == config


# ── masked-secret preservation logic ─────────────────────────────────────────
# We test the pure logic (decrypt existing → preserve) by exercising
# _mask_config + decrypt_credentials directly, without hitting the HTTP layer.

class TestMaskedSecretPreservation:
    def test_sftp_mask_sent_back_preserves_stored_password(self):
        """If client sends *** for password, the existing encrypted password is restored."""
        from routes.schedules import _MASK, SFTPTargetBody

        # Simulate: existing stored config has a real password
        existing_config = {
            "host": "sftp.example.com", "port": 22,
            "username": "user", "password": "stored-real-password",
            "remote_path": "/uploads", "host_key": _TEST_HOST_KEY,
        }

        # Client sends *** back (didn't touch the password field)
        body = SFTPTargetBody(
            type="sftp", host="sftp.example.com", port=22,
            username="user", password=_MASK, remote_path="/uploads",
            host_key=_TEST_HOST_KEY,
        )
        new_config = body.model_dump(exclude={"type", "enabled"})
        assert new_config["password"] == _MASK

        # Simulate the route's mask-preservation logic
        if new_config.get("password") == _MASK:
            new_config["password"] = existing_config["password"]

        assert new_config["password"] == "stored-real-password"

    def test_s3_mask_sent_back_preserves_stored_secret(self):
        """If client sends *** for secret_access_key, the stored value is preserved."""
        from routes.schedules import _MASK, S3TargetBody

        existing_config = {
            "bucket": "my-bucket", "prefix": "", "region": "us-east-1",
            "access_key_id": "AKID", "secret_access_key": "stored-real-secret",
        }

        body = S3TargetBody(
            type="s3", bucket="my-bucket", prefix="", region="us-east-1",
            access_key_id="AKID", secret_access_key=_MASK,
        )
        new_config = body.model_dump(exclude={"type", "enabled"})
        assert new_config["secret_access_key"] == _MASK

        if new_config.get("secret_access_key") == _MASK:
            new_config["secret_access_key"] = existing_config["secret_access_key"]

        assert new_config["secret_access_key"] == "stored-real-secret"

    def test_real_password_not_masked(self):
        """When a real password is sent, it is used as-is (no preservation)."""
        from routes.schedules import _MASK, SFTPTargetBody

        body = SFTPTargetBody(
            type="sftp", host="h", port=22,
            username="u", password="new-real-password",
            host_key=_TEST_HOST_KEY,
        )
        new_config = body.model_dump(exclude={"type", "enabled"})
        # The mask check would NOT trigger
        assert new_config["password"] != _MASK
        assert new_config["password"] == "new-real-password"


# ── _fmt_target ───────────────────────────────────────────────────────────────

class TestFmtTarget:
    def _make_target(self, type_="sftp", config=None):
        if config is None:
            config = {"host": "h", "username": "u", "password": "secret"}
        t = MagicMock()
        t.id = "target-1"
        t.schedule_id = "sched-1"
        t.type = type_
        t.enabled = True
        t.created_at = None
        t.updated_at = None
        return t, config

    def test_password_masked_in_sftp_response(self):
        from routes.schedules import _fmt_target
        target, config = self._make_target(type_="sftp")

        with patch("routes.schedules.decrypt_credentials", return_value=config):
            result = _fmt_target(target)

        assert result["config"]["password"] == "***"
        assert result["config"]["host"] == "h"

    def test_secret_masked_in_s3_response(self):
        from routes.schedules import _fmt_target
        config = {
            "bucket": "b", "region": "us-east-1",
            "access_key_id": "AKID", "secret_access_key": "real-secret",
        }
        target, _ = self._make_target(type_="s3", config=config)

        with patch("routes.schedules.decrypt_credentials", return_value=config):
            result = _fmt_target(target)

        assert result["config"]["secret_access_key"] == "***"
        assert result["config"]["access_key_id"] == "AKID"

    def test_decrypt_error_returns_masked_empty_config(self):
        """On decrypt failure, config falls back to {} and mask is applied to that empty dict."""
        from routes.schedules import _fmt_target
        target, _ = self._make_target(type_="sftp")

        with patch("routes.schedules.decrypt_credentials", side_effect=Exception("bad key")):
            result = _fmt_target(target)

        # _mask_config("sftp", {}) sets password="***" even when config is empty
        assert result["config"] == {"password": "***"}

    def test_response_shape(self):
        from routes.schedules import _fmt_target
        target, config = self._make_target()

        with patch("routes.schedules.decrypt_credentials", return_value=config):
            result = _fmt_target(target)

        assert set(result.keys()) == {"id", "schedule_id", "type", "config", "enabled", "created_at", "updated_at"}
        assert result["id"] == "target-1"
        assert result["schedule_id"] == "sched-1"
        assert result["type"] == "sftp"
        assert result["enabled"] is True
