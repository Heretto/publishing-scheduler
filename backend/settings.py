"""Application settings — extends HopCoreSettings with scheduler-specific config."""

from functools import lru_cache
from typing import Optional
from hop_core.config import HopCoreSettings


class AppSettings(HopCoreSettings):
    # Override redis_url to be optional — reserved for future use in hop-core
    redis_url: str = ""

    # Heretto API
    heretto_api_base_url: str = "https://demo-nxt.heretto.com/ezdnxtgen/api/v2"
    heretto_username: str = ""
    heretto_password: str = ""
    heretto_org: str = "jorsek"
    heretto_branch: str = "master"
    heretto_repository: str = "content"

    @property
    def heretto_ccms_base_url(self) -> str:
        return self.heretto_api_base_url.replace("/ezdnxtgen/api/v2", "/rest")

    @property
    def heretto_search_base_url(self) -> str:
        return self.heretto_api_base_url.replace("/ezdnxtgen/api/v2", "/ezdnxtgen/api")

    # Scheduler
    scheduler_max_consecutive_failures: int = 5
    job_retention_days: int = 90

    # Retry
    retry_max_attempts: int = 3
    retry_initial_delay_ms: int = 1000
    retry_max_delay_ms: int = 30000
    retry_backoff_multiplier: float = 2.0


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()
