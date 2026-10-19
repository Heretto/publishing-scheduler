"""Status exclusions: maps whose Heretto status an organization has excluded
(Settings › Status Value Exclusions) can't be chosen or published.

Statuses come from the per-connection status cache, falling back to Heretto
for documents it doesn't hold yet.
"""

import asyncio
import logging

from sqlalchemy.orm import Session

from models import StatusValueExclusion
from services import status_cache
from services.heretto_connection import HerettoConnection

logger = logging.getLogger(__name__)

# Uncached lookups go to Heretto one document each; keep it gentle.
LOOKUP_CONCURRENCY = 5


def excluded_values(org_id, db: Session) -> set[str]:
    """The organization's excluded status values."""
    rows = db.query(StatusValueExclusion.value).filter(StatusValueExclusion.org_id == str(org_id)).all()
    return {row.value for row in rows}


async def document_statuses(conn: HerettoConnection, doc_ids: list[str]) -> dict[str, str]:
    """Each document's status ("" when it has none, or when it can't be read)."""
    from clients.heretto_ccms import HerettoCcmsClient

    statuses: dict[str, str] = {}
    missing = []
    for doc_id in doc_ids:
        cached = status_cache.get(conn.id, doc_id)
        if cached is None:
            missing.append(doc_id)
        else:
            statuses[doc_id] = cached
    if missing:
        status_cache.ensure_loading(conn)
        ccms = HerettoCcmsClient(conn)
        gate = asyncio.Semaphore(LOOKUP_CONCURRENCY)

        async def lookup(doc_id: str) -> tuple[str, str]:
            async with gate:
                try:
                    return doc_id, await ccms.get_document_status(doc_id)
                except Exception as exc:   # an unreadable status doesn't block the rest
                    logger.warning("Could not read status of %s: %s", doc_id, exc)
                    return doc_id, ""

        statuses.update(await asyncio.gather(*(lookup(d) for d in missing)))
    return statuses


async def excluded_documents(
    conn: HerettoConnection, org_id, db: Session, doc_ids: list[str],
) -> dict[str, str]:
    """``{doc_id: status}`` for the documents whose status the organization excludes."""
    excluded = excluded_values(org_id, db)
    if not excluded or not doc_ids:
        return {}
    statuses = await document_statuses(conn, doc_ids)
    return {d: s for d, s in statuses.items() if s in excluded}
