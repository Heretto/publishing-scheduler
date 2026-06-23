"""Shared utility functions."""
import json


def parse_ids(value: str | None) -> list[str]:
    """Return a list from a stored JSON array or a legacy bare string.

    Handles three formats that may appear in the database:
    - JSON array: '["id1","id2"]'  → ["id1", "id2"]
    - Legacy single value: "id1"   → ["id1"]
    - Empty / None                 → []
    """
    if not value:
        return []
    v = value.strip()
    if v.startswith("["):
        try:
            return [str(x) for x in json.loads(v)]
        except json.JSONDecodeError:
            pass
    return [v]
