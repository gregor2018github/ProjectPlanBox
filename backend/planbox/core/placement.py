"""Placing an item among ordered siblings with fractional position keys.

Shared by every module with manual ordering. The frontend mirrors ``place``
for optimistic updates (``placeAmong`` in ``core/ordering.ts``).
"""

from planbox.core.errors import ValidationFailed
from planbox.core.ordering import OrderingError, key_between

type Positions = list[tuple[str, str]]
"""(id, position) pairs in display order."""


def place(siblings: Positions, before_id: str | None, after_id: str | None) -> str:
    """Computes a position among ``siblings`` (which exclude the item being placed).

    The frontend mirrors this rule for optimistic updates, so keep them in sync:
    ``after_id`` and ``before_id`` name the neighbours; a missing one is taken
    from the sibling order; neither means "at the end".

    Raises:
        ValidationFailed: If a neighbour is not a sibling or they are out of order.
    """
    index = {sibling_id: i for i, (sibling_id, _) in enumerate(siblings)}
    for neighbour in (before_id, after_id):
        if neighbour is not None and neighbour not in index:
            raise ValidationFailed("The neighbour to place next to is not in that container.")

    if after_id is not None:
        i = index[after_id]
        a: str | None = siblings[i][1]
        if before_id is not None:
            b: str | None = siblings[index[before_id]][1]
        else:
            b = siblings[i + 1][1] if i + 1 < len(siblings) else None
    elif before_id is not None:
        i = index[before_id]
        b = siblings[i][1]
        a = siblings[i - 1][1] if i > 0 else None
    else:
        a = siblings[-1][1] if siblings else None
        b = None
    try:
        return key_between(a, b)
    except OrderingError as exc:
        raise ValidationFailed("Those neighbours are not in order.") from exc


def free_position(siblings: Positions, wanted: str) -> str:
    """Keeps ``wanted`` unless a live sibling took that key meanwhile; then appends."""
    if all(position != wanted for _, position in siblings):
        return wanted
    return key_between(siblings[-1][1] if siblings else None, None)
