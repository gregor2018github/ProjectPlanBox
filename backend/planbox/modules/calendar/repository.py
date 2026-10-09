"""SQL for the calendar module. Repositories never commit; services own transactions."""

import dataclasses
import sqlite3
from collections.abc import Mapping, Sequence

from planbox.modules.calendar.models import Event, EventException

_EVENT = (
    "id, title, notes, location, all_day, start_at, end_at, start_date, end_date, rrule, "
    "created_at, updated_at, deleted_at"
)
_EXCEPTION = "id, event_id, occurrence_date, created_at, updated_at, deleted_at"
_EVENT_EDITABLE = frozenset(
    {
        "title",
        "notes",
        "location",
        "all_day",
        "start_at",
        "end_at",
        "start_date",
        "end_date",
        "rrule",
    }
)


def _event(row: sqlite3.Row) -> Event:
    values = dict(row)
    values["all_day"] = bool(values["all_day"])
    return Event(**values)


def _chunks(values: Sequence[str], size: int = 500) -> list[list[str]]:
    return [list(values[i : i + size]) for i in range(0, len(values), size)]


def _marks(values: Sequence[str]) -> str:
    return ",".join("?" * len(values))


class EventRepository:
    """``calendar_events``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, event_id: str) -> Event | None:
        """An event by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_EVENT} FROM calendar_events WHERE id = ?",  # noqa: S608
            (event_id,),
        ).fetchone()
        return None if row is None else _event(row)

    def list_single_in_range(
        self, start_at: str, end_at: str, start_date: str, end_date: str
    ) -> list[Event]:
        """Live non-recurring events overlapping a range.

        Args:
            start_at: Range start as a UTC instant (timed events).
            end_at: Exclusive range end as a UTC instant.
            start_date: Range start as a floating date (all-day events).
            end_date: Exclusive range end as a floating date.
        """
        rows = self._conn.execute(
            f"SELECT {_EVENT} FROM calendar_events "  # noqa: S608
            "WHERE deleted_at IS NULL AND rrule IS NULL AND ("
            "(all_day = 0 AND start_at < :end_at AND end_at > :start_at) OR "
            "(all_day = 1 AND start_date < :end_date AND end_date >= :start_date)"
            ") ORDER BY all_day DESC, start_date, start_at, id",
            {
                "start_at": start_at,
                "end_at": end_at,
                "start_date": start_date,
                "end_date": end_date,
            },
        ).fetchall()
        return [_event(r) for r in rows]

    def list_recurring_before(self, end_at: str, end_date: str) -> list[Event]:
        """Live recurring series that start before a range ends (they may reach into it)."""
        rows = self._conn.execute(
            f"SELECT {_EVENT} FROM calendar_events "  # noqa: S608
            "WHERE deleted_at IS NULL AND rrule IS NOT NULL AND ("
            "(all_day = 0 AND start_at < :end_at) OR (all_day = 1 AND start_date < :end_date)"
            ") ORDER BY id",
            {"end_at": end_at, "end_date": end_date},
        ).fetchall()
        return [_event(r) for r in rows]

    def insert(self, event: Event) -> None:
        """Inserts an event."""
        values = dataclasses.asdict(event)
        values["all_day"] = int(event.all_day)
        self._conn.execute(
            f"INSERT INTO calendar_events ({_EVENT}) VALUES ("  # noqa: S608
            ":id, :title, :notes, :location, :all_day, :start_at, :end_at, :start_date, "
            ":end_date, :rrule, :created_at, :updated_at, :deleted_at)",
            values,
        )

    def update(self, event_id: str, fields: Mapping[str, object], now: str) -> None:
        """Updates editable columns (booleans are stored as 0/1)."""
        unknown = set(fields) - _EVENT_EDITABLE
        if unknown:
            raise ValueError(f"cannot update {sorted(unknown)} on calendar_events")
        if not fields:
            return
        values = {k: int(v) if isinstance(v, bool) else v for k, v in fields.items()}
        assignments = ", ".join(f"{name} = :{name}" for name in values)
        self._conn.execute(
            f"UPDATE calendar_events SET {assignments}, updated_at = :updated_at "  # noqa: S608
            "WHERE id = :id",
            {**values, "updated_at": now, "id": event_id},
        )

    def set_deleted(self, event_id: str, deleted_at: str | None, now: str) -> None:
        """Soft-deletes (or, with ``None``, restores) an event."""
        self._conn.execute(
            "UPDATE calendar_events SET deleted_at = ?, updated_at = ? WHERE id = ?",
            (deleted_at, now, event_id),
        )


class ExceptionRepository:
    """``calendar_exceptions``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def live_for(self, event_ids: Sequence[str]) -> list[EventException]:
        """Live exceptions of the given events."""
        result: list[EventException] = []
        for chunk in _chunks(event_ids):
            rows = self._conn.execute(
                f"SELECT {_EXCEPTION} FROM calendar_exceptions "  # noqa: S608
                f"WHERE deleted_at IS NULL AND event_id IN ({_marks(chunk)}) "
                "ORDER BY event_id, occurrence_date",
                chunk,
            ).fetchall()
            result.extend(EventException(**dict(r)) for r in rows)
        return result

    def get_live(self, event_id: str, occurrence_date: str) -> EventException | None:
        """The live exception for one occurrence, if any."""
        row = self._conn.execute(
            f"SELECT {_EXCEPTION} FROM calendar_exceptions "  # noqa: S608
            "WHERE deleted_at IS NULL AND event_id = ? AND occurrence_date = ?",
            (event_id, occurrence_date),
        ).fetchone()
        return None if row is None else EventException(**dict(row))

    def insert(self, exception: EventException) -> None:
        """Inserts an exception."""
        self._conn.execute(
            f"INSERT INTO calendar_exceptions ({_EXCEPTION}) VALUES ("  # noqa: S608
            ":id, :event_id, :occurrence_date, :created_at, :updated_at, :deleted_at)",
            dataclasses.asdict(exception),
        )

    def move(self, exception_id: str, event_id: str, occurrence_date: str, now: str) -> None:
        """Re-keys an exception (its series was split or shifted)."""
        self._conn.execute(
            "UPDATE calendar_exceptions SET event_id = ?, occurrence_date = ?, updated_at = ? "
            "WHERE id = ?",
            (event_id, occurrence_date, now, exception_id),
        )

    def set_deleted(self, exception_id: str, deleted_at: str | None, now: str) -> None:
        """Soft-deletes an exception, which brings its occurrence back."""
        self._conn.execute(
            "UPDATE calendar_exceptions SET deleted_at = ?, updated_at = ? WHERE id = ?",
            (deleted_at, now, exception_id),
        )


def summarize_events(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, tuple[str, bool]]:
    """Title and deleted flag per event id (for core tags/links/search)."""
    result: dict[str, tuple[str, bool]] = {}
    for chunk in _chunks(ids):
        rows = conn.execute(
            f"SELECT id, title, deleted_at FROM calendar_events WHERE id IN ({_marks(chunk)})",  # noqa: S608
            chunk,
        ).fetchall()
        for r in rows:
            result[str(r["id"])] = (str(r["title"]), r["deleted_at"] is not None)
    return result
