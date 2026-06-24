"""Add status_value_exclusions table.

Revision ID: 002
"""
revision = "002"
down_revision = "001"

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


def upgrade():
    conn = op.get_bind()
    tables = inspect(conn).get_table_names()
    if "status_value_exclusions" not in tables:
        op.create_table(
            "status_value_exclusions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "org_id",
                sa.String(36),
                sa.ForeignKey("organizations.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("value", sa.String(255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.UniqueConstraint("org_id", "value", name="uq_exclusion_org_value"),
        )


def downgrade():
    op.drop_table("status_value_exclusions")
