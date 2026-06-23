"""Alembic environment — wired to hop-core's engine and metadata."""
from alembic import context
from hop_core.db import Base, get_engine
import models  # noqa: F401 — registers Schedule/JobHistory on Base

OUR_TABLES = {"schedules", "job_history"}


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table":
        return name in OUR_TABLES
    return True


def run_migrations_online():
    engine = get_engine()
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=Base.metadata,
            include_object=include_object,
            compare_type=True,
            render_as_batch=True,   # required for SQLite ALTER TABLE support
        )
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
