"""Streaks: runs of scheduled days that were checked.

Only scheduled days count. A check-in on an unscheduled day is kept and shown,
but neither extends nor breaks a streak. Today is still open: until it is
checked it does not break the current streak.
"""

from collections.abc import Iterable, Set
from datetime import date


def streaks(scheduled: Iterable[date], checked: Set[date], today: date) -> tuple[int, int]:
    """Computes the current and the best streak.

    Args:
        scheduled: Every scheduled day from the start up to and including
            ``today``, ascending.
        checked: The days with a check-in.
        today: Today in the configured zone.

    Returns:
        ``(current, best)``.
    """
    run = best = 0
    for day in scheduled:
        if day in checked:
            run += 1
            best = max(best, run)
        elif day < today:
            run = 0
    return run, best
