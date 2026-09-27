"""Shared test configuration and fixtures."""

import sys
import os

# Ensure the backend package root is on sys.path so test imports work.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from unittest.mock import MagicMock, patch


def _make_mock_settings():
    s = MagicMock()
    s.heretto_host = "test.heretto.com"
    s.heretto_org = "testorg"
    s.heretto_username = "testuser"
    s.heretto_password = "testpass"
    s.heretto_branch = "master"
    s.heretto_repository = "content"
    s.heretto_api_base_url = "https://test.heretto.com/ezdnxtgen/api/v2"
    s.heretto_ccms_base_url = "https://test.heretto.com/rest"
    s.heretto_search_base_url = "https://test.heretto.com/ezdnxtgen/api"
    s.retry_max_attempts = 1
    s.retry_initial_delay_ms = 0
    s.retry_max_delay_ms = 0
    s.retry_backoff_multiplier = 1.0
    s.scheduler_max_consecutive_failures = 5
    s.job_timeout_seconds = 300
    s.job_retention_days = 90
    s.delivery_poll_interval_seconds = 60
    s.delivery_max_poll_attempts = 60
    return s


@pytest.fixture(autouse=True)
def mock_settings():
    """Patch get_settings everywhere so tests never need a real .env file."""
    s = _make_mock_settings()
    with patch("settings.get_settings", return_value=s), \
         patch("clients.heretto.get_settings", return_value=s), \
         patch("clients.heretto_ccms.get_settings", return_value=s), \
         patch("services.job_executor.get_settings", return_value=s), \
         patch("services.delivery_poller.get_settings", return_value=s):
        yield s
