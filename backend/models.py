"""SQLAlchemy models for Schedule and JobHistory.

These tables live alongside hop-core's auth tables in the same database.
We import Base from hop_core.db so init_db() creates everything in one pass.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, LargeBinary, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship
from sqlalchemy.types import TypeDecorator, String as SAString

from hop_core.db import Base


# ── UUID compatibility shim ───────────────────────────────────────────────────
# SQLite stores UUIDs as TEXT; PostgreSQL uses a native UUID column.
class UUIDType(TypeDecorator):
    """Platform-independent UUID type (TEXT on SQLite, UUID on PostgreSQL)."""
    impl = SAString(36)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        return str(value)


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Schedule ──────────────────────────────────────────────────────────────────
class Schedule(Base):
    __tablename__ = "schedules"

    id = Column(UUIDType, primary_key=True, default=_uuid)
    org_id = Column(
        UUIDType,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    cron_expression = Column(String(255), nullable=False)
    scenario_id = Column(String(255), nullable=False)
    deployment_id = Column(String(255), default="")
    document_ids = Column(Text, default="[]")       # JSON array
    folder_ids = Column(Text, default="[]")         # JSON array
    document_releases = Column(Text, default="{}")  # JSON object {mapId: releaseId}
    enabled = Column(Boolean, default=True)
    branch = Column(String(255), default="master")
    locale = Column(String(50), default="")
    publish_parameters = Column(Text, default="[]") # JSON array
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_run_status = Column(String(50), nullable=True)
    consecutive_failures = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    jobs = relationship(
        "JobHistory", back_populates="schedule", cascade="all, delete-orphan"
    )
    delivery_target = relationship(
        "DeliveryTarget", back_populates="schedule", uselist=False, cascade="all, delete-orphan"
    )


# ── JobHistory ────────────────────────────────────────────────────────────────
class JobHistory(Base):
    __tablename__ = "job_history"

    id = Column(UUIDType, primary_key=True, default=_uuid)
    schedule_id = Column(
        UUIDType,
        ForeignKey("schedules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(String(50), nullable=False, default="running")
    trigger_type = Column(String(50), nullable=False, default="scheduled")
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    heretto_job_id = Column(String(512), nullable=True)
    publish_jobs = Column(Text, default="[]")        # JSON array of {fileId, publishId, documentName}
    request_payload = Column(Text, default="{}")    # JSON object
    response_payload = Column(Text, default="{}")   # JSON object
    error = Column(Text, nullable=True)

    schedule = relationship("Schedule", back_populates="jobs")
    pending_deliveries = relationship(
        "PendingDelivery", back_populates="job_history", cascade="all, delete-orphan"
    )


# ── StatusValueExclusion ──────────────────────────────────────────────────────
class StatusValueExclusion(Base):
    __tablename__ = "status_value_exclusions"

    id = Column(UUIDType, primary_key=True, default=_uuid)
    org_id = Column(
        UUIDType,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("org_id", "value", name="uq_exclusion_org_value"),)


# ── DeliveryTarget ────────────────────────────────────────────────────────────
class DeliveryTarget(Base):
    """Per-schedule delivery target.  Config is stored as Fernet-encrypted JSON
    so that both SFTP and S3 credentials live in a single column regardless of
    target type.  The *type* column ('sftp' or 's3') tells the poller which
    delivery client to instantiate."""

    __tablename__ = "delivery_targets"

    id = Column(UUIDType, primary_key=True, default=_uuid)
    schedule_id = Column(
        UUIDType,
        ForeignKey("schedules.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    type = Column(String(20), nullable=False)          # 'sftp' | 's3'
    config_encrypted = Column(LargeBinary, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    schedule = relationship("Schedule", back_populates="delivery_target")


# ── PendingDelivery ───────────────────────────────────────────────────────────
class PendingDelivery(Base):
    """One row per Heretto publish job that has an associated delivery target.

    The poller probes the bundle endpoint for each row, downloads the ZIP
    once the job is complete, and streams it to the configured target."""

    __tablename__ = "pending_deliveries"

    id = Column(UUIDType, primary_key=True, default=_uuid)
    job_history_id = Column(
        UUIDType,
        ForeignKey("job_history.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    file_id = Column(String(255), nullable=False)
    publish_id = Column(String(255), nullable=False)
    document_name = Column(String(500), nullable=False, default="")
    status = Column(String(50), nullable=False, default="pending")
    attempts = Column(Integer, nullable=False, default=0)
    last_polled_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    job_history = relationship("JobHistory", back_populates="pending_deliveries")
