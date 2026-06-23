"""In-memory document status cache.

Populated at startup and refreshed hourly from the Heretto search API.
Provides near-instant responses for per-document status lookups and the
status filter dropdown, avoiding N individual REST calls at runtime.
"""

import logging

logger = logging.getLogger(__name__)

# {doc_id: status_string}  — status may be "" when the document has no status set
_cache: dict[str, str] = {}
_ready: bool = False


def is_ready() -> bool:
    """True after the cache has been populated at least once."""
    return _ready


def get(doc_id: str) -> str | None:
    """Return the cached status for *doc_id*, or ``None`` if not in cache."""
    if not _ready:
        return None
    return _cache.get(doc_id)  # type: ignore[return-value]  # may be absent → None


def get_distinct_values() -> list[str]:
    """Return sorted list of distinct non-empty status values across all docs."""
    return sorted({v for v in _cache.values() if v})


def populate(status_map: dict[str, str]) -> None:
    """Replace the cache contents with *status_map* and mark the cache ready."""
    global _cache, _ready
    _cache = dict(status_map)
    _ready = True
    distinct = len({v for v in _cache.values() if v})
    logger.info(
        "Status cache populated: %d documents, %d distinct status values",
        len(_cache),
        distinct,
    )
