"""Time source and timestamp formatting.

This is the only module allowed to read the system clock. Everything else
receives a ``Clock`` so tests can control time.
"""

from datetime import UTC, datetime, timedelta
from typing import Protocol


class Clock(Protocol):
    """A source of the current instant."""

    def now(self) -> datetime:
        """Returns the current instant as an aware UTC datetime."""
        ...


class SystemClock:
    """The real clock."""

    def now(self) -> datetime:
        """Returns the current instant as an aware UTC datetime."""
        return datetime.now(UTC)


class FixedClock:
    """A manually advanced clock for tests and deterministic tooling."""

    def __init__(self, start: datetime) -> None:
        if start.tzinfo is None:
            raise ValueError("FixedClock needs an aware datetime")
        self._now = start.astimezone(UTC)

    def now(self) -> datetime:
        """Returns the frozen instant."""
        return self._now

    def advance(self, delta: timedelta) -> None:
        """Moves the clock forward by ``delta``."""
        self._now += delta


def to_iso(instant: datetime) -> str:
    """Formats an aware datetime as fixed-width UTC ISO-8601 with milliseconds.

    Fixed width (``2026-10-08T16:33:04.390Z``) makes string order equal time
    order, which the database relies on.

    Raises:
        ValueError: If ``instant`` is naive.
    """
    if instant.tzinfo is None:
        raise ValueError("to_iso needs an aware datetime")
    utc = instant.astimezone(UTC)
    return f"{utc:%Y-%m-%dT%H:%M:%S}.{utc.microsecond // 1000:03d}Z"


def utc_now_iso(clock: Clock) -> str:
    """Returns the clock's current instant formatted with ``to_iso``."""
    return to_iso(clock.now())
