"""Add required_status column to schedules.

Revision ID: 004
"""
revision = "004"
down_revision = "003"

import sqlalchemy as sa
from alembic import op


def upgrade():
    op.add_column("schedules", sa.Column("required_status", sa.String(100), nullable=True))


def downgrade():
    op.drop_column("schedules", "required_status")
