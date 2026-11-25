"""Add required_status column to schedules.

Revision ID: 004
"""
revision = "004"
down_revision = "003"

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


def upgrade():
    # A fresh database gets the column from create_all() before migrations run.
    existing = {c["name"] for c in inspect(op.get_bind()).get_columns("schedules")}
    if "required_status" not in existing:
        op.add_column("schedules", sa.Column("required_status", sa.String(100), nullable=True))


def downgrade():
    op.drop_column("schedules", "required_status")
