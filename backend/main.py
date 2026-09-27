"""Publishing Scheduler — FastAPI application built on hop-core."""

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from hop_core.app_factory import create_hop_app
from hop_core.db import get_session_factory
from sqlalchemy.orm import Session

from limiter import setup_limiter

# Import models so they register on hop-core's Base before init_db() runs
import models  # noqa: F401

from routes import schedules as schedules_router
from routes import jobs as jobs_router
from routes import heretto as heretto_router
from routes import dashboard as dashboard_router
from routes import settings as settings_router
from services import scheduler as sched
from services import status_cache
from services.delivery_poller import DeliveryPollerService
from services.job_executor import JobExecutorService
from settings import get_settings

logger = logging.getLogger(__name__)

_executor: JobExecutorService | None = None


def _get_executor() -> JobExecutorService:
    global _executor
    if _executor is None:
        _executor = JobExecutorService()
    return _executor


async def _run_scheduled_job(schedule_id: str):
    """Entry point called by APScheduler for each fired cron trigger."""
    SessionLocal = get_session_factory()
    db: Session = SessionLocal()
    try:
        await _get_executor().execute(schedule_id, db, trigger_type="scheduled")
    finally:
        db.close()


async def _prune_old_jobs():
    """Background task — prunes job_history rows older than retention window."""
    from models import JobHistory
    from sqlalchemy import func

    s = get_settings()
    while True:
        await asyncio.sleep(24 * 60 * 60)  # once per day
        SessionLocal = get_session_factory()
        db: Session = SessionLocal()
        try:
            cutoff = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            from datetime import timedelta
            cutoff -= timedelta(days=s.job_retention_days)
            deleted = db.query(JobHistory).filter(JobHistory.started_at < cutoff).delete()
            db.commit()
            if deleted:
                logger.info("Pruned %d old job history rows", deleted)
        except Exception as exc:
            logger.error("Failed to prune old jobs: %s", exc)
        finally:
            db.close()


async def _load_status_cache():
    """Populate the in-memory document status cache from the Heretto search API.

    Retries up to 3 times with 30 s / 60 s back-off before giving up.
    """
    from clients.heretto_ccms import HerettoCcmsClient
    for attempt in range(1, 4):
        try:
            status_map = await HerettoCcmsClient().fetch_status_map()
            status_cache.populate(status_map)
            return
        except Exception as exc:
            logger.warning("Status cache load attempt %d/3 failed: %s", attempt, exc)
            if attempt < 3:
                await asyncio.sleep(30 * attempt)
    logger.error("Status cache could not be populated after 3 attempts")


async def _refresh_status_cache():
    """Background task — refreshes the status cache once per hour."""
    from clients.heretto_ccms import HerettoCcmsClient
    while True:
        await asyncio.sleep(60 * 60)  # once per hour
        try:
            status_map = await HerettoCcmsClient().fetch_status_map()
            status_cache.populate(status_map)
        except Exception as exc:
            logger.warning("Failed to refresh status cache: %s", exc)


def _load_schedules():
    """Load all enabled schedules from the DB into APScheduler at startup."""
    from models import Schedule
    SessionLocal = get_session_factory()
    db: Session = SessionLocal()
    try:
        schedules = db.query(Schedule).filter(Schedule.enabled.is_(True)).all()
        count = sched.load_all(schedules, _run_scheduled_job)
        logger.info("Scheduler loaded %d active schedule(s)", count)
    finally:
        db.close()


app: FastAPI = create_hop_app(
    settings_factory=get_settings,
    extra_routers=[
        schedules_router.router,
        jobs_router.router,
        heretto_router.router,
        dashboard_router.router,
        settings_router.router,
    ],
    title="Heretto Publishing Scheduler",
    version="2.0.0",
    description="Scheduled publishing jobs for Heretto content, with SSO and multi-tenancy.",
    include_credentials_router=True,
    include_agents_router=False,
)

setup_limiter(app)

_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com; "
    "font-src 'self' https://fonts.gstatic.com https://api.fontshare.com; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)


@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = _CSP
    is_https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto") == "https"
    )
    if is_https:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.middleware("http")
async def _request_id(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(RequestValidationError)
async def _log_validation_error(request: Request, exc: RequestValidationError):
    logger.debug("422 on %s %s: %s", request.method, request.url.path, exc.errors())
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


def _run_migrations():
    """Apply pending Alembic migrations."""
    import os
    from alembic.config import Config
    from alembic import command
    cfg = Config(os.path.join(os.path.dirname(__file__), "alembic.ini"))
    command.upgrade(cfg, "head")
    logger.info("Database migrations up to date")


def _auto_seed():
    """Create the initial admin account from ADMIN_EMAIL / ADMIN_PASSWORD env vars.

    Runs only when both vars are set and no superuser exists yet, so it is
    safe to leave in place permanently — it is a no-op after the first run.
    """
    import re
    import uuid as _uuid
    from hop_core.models.user import User
    from hop_core.models.organization import Organization, OrganizationMember
    from hop_core.models.enums import OrganizationRole
    from hop_core.core.security import get_password_hash

    s = get_settings()
    if not s.admin_email or not s.admin_password:
        logger.info(
            "ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping auto-seed. "
            "Run backend/scripts/seed.py to create the first admin account."
        )
        return

    SessionLocal = get_session_factory()
    db = SessionLocal()
    try:
        if db.query(User).filter(User.is_superuser.is_(True)).first():
            logger.debug("Auto-seed: superuser already exists, skipping.")
            return

        password = s.admin_password
        errors = []
        if len(password) < 12:
            errors.append("at least 12 characters")
        if not re.search(r"[A-Z]", password):
            errors.append("at least one uppercase letter")
        if not re.search(r"\d", password):
            errors.append("at least one digit")
        if not re.search(r"[^A-Za-z0-9]", password):
            errors.append("at least one special character")
        if errors:
            logger.error(
                "Auto-seed skipped: ADMIN_PASSWORD does not meet requirements (%s).",
                ", ".join(errors),
            )
            return

        slug = s.single_org_slug or "publishing-scheduler"
        org = db.query(Organization).filter(Organization.slug == slug).first()
        if not org:
            org = Organization(
                id=_uuid.uuid4(),
                name="Publishing Scheduler",
                slug=slug,
                is_active=True,
            )
            db.add(org)
            db.commit()

        admin = User(
            id=_uuid.uuid4(),
            email=s.admin_email,
            password_hash=get_password_hash(password),
            is_active=True,
            is_superuser=True,
            current_organization_id=org.id,
        )
        db.add(admin)
        db.flush()
        db.add(OrganizationMember(
            user_id=admin.id,
            organization_id=org.id,
            role=OrganizationRole.ADMIN,
        ))
        db.commit()
        logger.info("Auto-seed: created admin account <%s>.", s.admin_email)
    except Exception:
        logger.exception("Auto-seed failed — continuing startup.")
        db.rollback()
    finally:
        db.close()


# @app.on_event("startup/shutdown") does not fire when the app is created with
# an explicit lifespan= (Starlette 0.20+, which hop-core uses). Capture the
# hop-core lifespan and wrap it so our startup runs inside it — after
# hop-core's init_db() has completed.
_hop_lifespan = app.router.lifespan_context


@asynccontextmanager
async def _lifespan(app: FastAPI):
    async with _hop_lifespan(app):
        _run_migrations()
        _auto_seed()
        sched.start()
        _load_schedules()
        asyncio.create_task(_prune_old_jobs())
        asyncio.create_task(_load_status_cache())
        asyncio.create_task(_refresh_status_cache())
        asyncio.create_task(DeliveryPollerService().run(get_session_factory()))
        logger.info("Publishing Scheduler started")
        yield
        sched.shutdown(wait=True)
        logger.info("Publishing Scheduler shut down")


app.router.lifespan_context = _lifespan


@app.get("/api/health")
async def health():
    from hop_core.db import get_engine
    from sqlalchemy import text
    db_ok = False
    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        logger.warning("Health check database probe failed: %s", exc)
        db_ok = False

    return {
        "status": "ok" if db_ok else "degraded",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "database": "ok" if db_ok else "error",
            "scheduler": {"activeJobs": sched.active_count()},
        },
    }
