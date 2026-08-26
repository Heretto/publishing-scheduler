"""Alembic environment — wired to hop-core's engine and metadata."""
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import Table

# The backend package root, so `import models` and `import settings` resolve
# however alembic was invoked. Under uvicorn the working directory already puts
# it on the path, but the alembic CLI does not, and without this every command
# that loads this file fails with "No module named 'models'".
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hop_core import db as hop_db  # noqa: E402
from hop_core.db import Base  # noqa: E402

# hop-core's own models must be registered on Base before ours, or our foreign
# keys into organizations cannot resolve and autogenerate fails with
# NoReferencedTableError. Registering them is also what makes include_object
# below necessary: their tables are then in the metadata we compare against.
import hop_core.models  # noqa: E402,F401
import models  # noqa: E402,F401 — registers this app's models on hop-core's Base


def _our_tables() -> set[str]:
    """The tables this application owns.

    Our models share hop-core's declarative Base, so Base.metadata also
    describes hop-core's tables (users, organizations, organization_members,
    organization_invitations, credentials). Autogenerate must be restricted to
    ours: unfiltered, it emits a dozen spurious modify_type operations against
    hop-core's schema, because its UUID columns reflect out of SQLite as
    NUMERIC. Those migrations would rewrite tables this app does not own.

    Derived from the models module rather than listed by hand. A hand-written
    list goes stale the moment a table is added, and a table missing from it is
    excluded from the comparison entirely — so changes to it never appear in a
    generated migration and the schema drifts silently. That is what happened to
    status_value_exclusions.
    """
    tables = {
        mapper.class_.__tablename__
        for mapper in Base.registry.mappers
        if mapper.class_.__module__ == models.__name__
    }
    # Tables declared directly as Table(...) at module level rather than through
    # a mapped class — association tables, for instance — are not in the mapper
    # registry, so pick those up separately.
    tables |= {
        obj.name for obj in vars(models).values() if isinstance(obj, Table)
    }
    return tables


OUR_TABLES = _our_tables()

if not OUR_TABLES:
    raise RuntimeError(
        "No application tables were found in models.py, so autogenerate would "
        "ignore every table and silently produce empty migrations. Check that "
        "the models are declared there and that the module imports cleanly."
    )


def _engine():
    """hop-core's engine, initialising it if nothing else has.

    Under uvicorn, hop-core initialises the engine during startup and the
    migrations main.py runs at that point reuse it. The alembic CLI has no such
    startup, so without this every CLI command fails with "Database engine not
    initialized".
    """
    try:
        return hop_db.get_engine()
    except RuntimeError:
        from settings import get_settings

        hop_db.init_engine(get_settings().database_url)
        return hop_db.get_engine()


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table":
        return name in OUR_TABLES
    return True


def run_migrations_online():
    with _engine().connect() as connection:
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
