"""Application settings — extends HopCoreSettings with scheduler-specific config."""

from functools import lru_cache
from typing import Optional
from hop_core.config import HopCoreSettings


class AppSettings(HopCoreSettings):
    # Override redis_url to be optional — reserved for future use in hop-core
    redis_url: str = ""

    # First-run admin bootstrap — if set and no superuser exists at startup,
    # an admin account is created automatically (Docker / unattended installs).
    admin_email: Optional[str] = None
    admin_password: Optional[str] = None

    # Heretto API
    # heretto_host: full domain of the Heretto instance
    #   (e.g. "acme.heretto.com" or "cms.acme.com" for self-hosted)
    # heretto_org: org identifier used in CCMS content paths
    #   (/db/organizations/{org}/repositories/...)
    #   Usually equals the subdomain of heretto_host, but not always —
    #   set explicitly when they differ (e.g. host "demo-nxt.heretto.com", org "jorsek").
    heretto_host: str = ""
    heretto_org: str = ""
    heretto_username: str = ""
    heretto_password: str = ""
    heretto_branch: str = "master"
    heretto_repository: str = "content"

    @property
    def heretto_api_base_url(self) -> str:
        return f"https://{self.heretto_host}/ezdnxtgen/api/v2"

    @property
    def heretto_ccms_base_url(self) -> str:
        return f"https://{self.heretto_host}/rest"

    @property
    def heretto_search_base_url(self) -> str:
        return f"https://{self.heretto_host}/ezdnxtgen/api"

    # Scheduler
    scheduler_max_consecutive_failures: int = 5
    job_retention_days: int = 90

    # Retry
    retry_max_attempts: int = 3
    retry_initial_delay_ms: int = 1000
    retry_max_delay_ms: int = 30000
    retry_backoff_multiplier: float = 2.0

    # Job execution
    job_timeout_seconds: int = 1800  # 30 minutes


@lru_cache
def get_settings() -> AppSettings:
    return AppSettings()
