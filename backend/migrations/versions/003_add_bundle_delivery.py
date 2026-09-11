"""Add delivery_targets and pending_deliveries tables; add publish_jobs to job_history.

Revision ID: 003
"""
revision = "003"
down_revision = "002"

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


def upgrade():
    conn = op.get_bind()
    tables = inspect(conn).get_table_names()

    if "delivery_targets" not in tables:
        op.create_table(
            "delivery_targets",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "schedule_id",
                sa.String(36),
                sa.ForeignKey("schedules.id", ondelete="CASCADE"),
                nullable=False,
                unique=True,
                index=True,
            ),
            sa.Column("type", sa.String(20), nullable=False),
            sa.Column("config_encrypted", sa.LargeBinary, nullable=False),
            sa.Column("enabled", sa.Boolean, nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    if "pending_deliveries" not in tables:
        op.create_table(
            "pending_deliveries",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "job_history_id",
                sa.String(36),
                sa.ForeignKey("job_history.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("file_id", sa.String(255), nullable=False),
            sa.Column("publish_id", sa.String(255), nullable=False),
            sa.Column("document_name", sa.String(500), nullable=False, server_default=""),
            sa.Column("status", sa.String(50), nullable=False, server_default="pending"),
            sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
            sa.Column("last_polled_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("error", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        )

    existing_jh = {col["name"] for col in inspect(conn).get_columns("job_history")}
    if "publish_jobs" not in existing_jh:
        with op.batch_alter_table("job_history") as batch_op:
            batch_op.add_column(sa.Column("publish_jobs", sa.Text, server_default="[]"))


def downgrade():
    op.drop_table("pending_deliveries")
    op.drop_table("delivery_targets")
    with op.batch_alter_table("job_history") as batch_op:
        batch_op.drop_column("publish_jobs")
