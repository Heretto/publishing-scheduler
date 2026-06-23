"""Add locale, folder_ids, document_releases columns to schedules.

Revision ID: 001
"""
revision = "001"
down_revision = None

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


def upgrade():
    conn = op.get_bind()
    existing = {col["name"] for col in inspect(conn).get_columns("schedules")}
    with op.batch_alter_table("schedules") as batch_op:
        if "locale" not in existing:
            batch_op.add_column(sa.Column("locale", sa.Text(), server_default=""))
        if "folder_ids" not in existing:
            batch_op.add_column(sa.Column("folder_ids", sa.Text(), server_default="[]"))
        if "document_releases" not in existing:
            batch_op.add_column(sa.Column("document_releases", sa.Text(), server_default="{}"))


def downgrade():
    with op.batch_alter_table("schedules") as batch_op:
        for col in ("document_releases", "folder_ids", "locale"):
            batch_op.drop_column(col)
