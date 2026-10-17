"""In-memory document status cache, one per Heretto connection.

Populated at startup and refreshed hourly from the Heretto search API for every
organization's Heretto connection, and loaded on first use for a connection
added since. Provides near-instant responses for per-document status lookups
and the status filter dropdown, avoiding N individual REST calls at runtime.
"""

import asyncio
import logging

logger = logging.getLogger(__name__)

# {connection_id: {doc_id: status_string}} — status may be "" when the document has no status set
_caches: dict[str, dict[str, str]] = {}
_loading: set[str] = set()

MAX_CACHE_SIZE = 500_000


def is_ready(connection_id: str) -> bool:
    """True after the connection's cache has been populated at least once."""
    return connection_id in _caches


def get(connection_id: str, doc_id: str) -> str | None:
    """Return the cached status for *doc_id*, or ``None`` if not in cache."""
    return _caches.get(connection_id, {}).get(doc_id)


def get_distinct_values(connection_id: str) -> list[str]:
    """Return sorted list of distinct non-empty status values across the connection's docs."""
    return sorted({v for v in _caches.get(connection_id, {}).values() if v})


def populate(connection_id: str, status_map: dict[str, str]) -> None:
    """Replace the connection's cache with *status_map* and mark it ready."""
    if len(status_map) > MAX_CACHE_SIZE:
        logger.warning(
            "Status cache truncated: %d documents exceeds limit of %d; "
            "oldest entries dropped",
            len(status_map),
            MAX_CACHE_SIZE,
        )
        status_map = dict(list(status_map.items())[:MAX_CACHE_SIZE])
    _caches[connection_id] = status_map
    distinct = len({v for v in status_map.values() if v})
    logger.info(
        "Status cache populated for connection %s: %d documents, %d distinct status values",
        connection_id,
        len(status_map),
        distinct,
    )


async def load(conn) -> None:
    """Fetch and cache *conn*'s status map. Raises on failure."""
    from clients.heretto_ccms import HerettoCcmsClient
    populate(conn.id, await HerettoCcmsClient(conn).fetch_status_map())


def ensure_loading(conn) -> None:
    """Start loading *conn*'s cache in the background unless it's ready or already loading.

    A connection added after startup would otherwise wait for the hourly refresh.
    """
    if is_ready(conn.id) or conn.id in _loading:
        return
    _loading.add(conn.id)

    async def _run():
        try:
            await load(conn)
        except Exception as exc:
            logger.warning("Status cache load failed for connection %s: %s", conn.id, exc)
        finally:
            _loading.discard(conn.id)

    asyncio.get_running_loop().create_task(_run())
