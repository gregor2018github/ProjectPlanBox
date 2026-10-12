"""SQL for the habits module. Repositories never commit; services own transactions."""

import dataclasses
import sqlite3
from collections.abc import Mapping, Sequence

from planbox.core.placement import Positions
from planbox.modules.habits.models import Checkin, DayOff, Habit

_HABIT = "id, name, notes, rrule, start_date, position, created_at, updated_at, deleted_at"
_HABIT_EDITABLE = frozenset({"name", "notes", "rrule", "start_date", "position"})
_DAY_ROW = "id, habit_id, day, created_at, updated_at, deleted_at"
_CHUNK = 500


class HabitRepository:
    """``habits``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, habit_id: str) -> Habit | None:
        """A habit by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_HABIT} FROM habits WHERE id = ?",  # noqa: S608
            (habit_id,),
        ).fetchone()
        return None if row is None else Habit(**dict(row))

    def list_live(self) -> list[Habit]:
        """Live habits in order."""
        rows = self._conn.execute(
            f"SELECT {_HABIT} FROM habits WHERE deleted_at IS NULL ORDER BY position, id"  # noqa: S608
        ).fetchall()
        return [Habit(**dict(r)) for r in rows]

    def positions(self, exclude_id: str | None = None) -> Positions:
        """Positions of live habits."""
        rows = self._conn.execute(
            "SELECT id, position FROM habits "
            "WHERE deleted_at IS NULL AND id IS NOT ? ORDER BY position, id",
            (exclude_id,),
        ).fetchall()
        return [(str(r["id"]), str(r["position"])) for r in rows]

    def insert(self, habit: Habit) -> None:
        """Inserts a habit."""
        self._conn.execute(
            f"INSERT INTO habits ({_HABIT}) VALUES (:id, :name, :notes, :rrule, "  # noqa: S608
            ":start_date, :position, :created_at, :updated_at, :deleted_at)",
            dataclasses.asdict(habit),
        )

    def update(self, habit_id: str, fields: Mapping[str, object], now: str) -> None:
        """Updates the given editable fields."""
        unknown = set(fields) - _HABIT_EDITABLE
        if unknown:
            raise ValueError(f"cannot update {sorted(unknown)} on habits")
        if not fields:
            return
        assignments = ", ".join(f"{name} = :{name}" for name in fields)
        self._conn.execute(
            f"UPDATE habits SET {assignments}, updated_at = :updated_at WHERE id = :id",  # noqa: S608
            {**fields, "updated_at": now, "id": habit_id},
        )

    def set_deleted(self, habit_id: str, deleted_at: str | None, now: str) -> None:
        """Soft-deletes (or, with ``None``, restores) a habit; its check-ins stay."""
        self._conn.execute(
            "UPDATE habits SET deleted_at = ?, updated_at = ? WHERE id = ?",
            (deleted_at, now, habit_id),
        )


class _DayRepository[T: (Checkin, DayOff)]:
    """A table of one live row per habit and day (check-ins, days off)."""

    _table: str
    _row: type[T]

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def live_on(self, habit_id: str, day: str) -> T | None:
        """The live row of a habit on a day, if any."""
        row = self._conn.execute(
            f"SELECT {_DAY_ROW} FROM {self._table} "  # noqa: S608
            "WHERE habit_id = ? AND day = ? AND deleted_at IS NULL",
            (habit_id, day),
        ).fetchone()
        return None if row is None else self._row(**dict(row))

    def live_days(self, habit_ids: Sequence[str]) -> dict[str, list[str]]:
        """Every day with a live row per habit, ascending."""
        result: dict[str, list[str]] = {habit_id: [] for habit_id in habit_ids}
        for start in range(0, len(habit_ids), _CHUNK):
            chunk = list(habit_ids[start : start + _CHUNK])
            rows = self._conn.execute(
                f"SELECT habit_id, day FROM {self._table} WHERE deleted_at IS NULL "  # noqa: S608
                f"AND habit_id IN ({','.join('?' * len(chunk))}) ORDER BY day",
                chunk,
            ).fetchall()
            for r in rows:
                result[str(r["habit_id"])].append(str(r["day"]))
        return result

    def insert(self, row: T) -> None:
        """Inserts a row."""
        self._conn.execute(
            f"INSERT INTO {self._table} ({_DAY_ROW}) "  # noqa: S608
            "VALUES (:id, :habit_id, :day, :created_at, :updated_at, :deleted_at)",
            dataclasses.asdict(row),
        )

    def set_deleted(self, row_id: str, deleted_at: str, now: str) -> None:
        """Soft-deletes a row (unchecking a day, taking a day off back)."""
        self._conn.execute(
            f"UPDATE {self._table} SET deleted_at = ?, updated_at = ? WHERE id = ?",  # noqa: S608
            (deleted_at, now, row_id),
        )


class CheckinRepository(_DayRepository[Checkin]):
    """``habits_checkins``."""

    _table = "habits_checkins"
    _row = Checkin


class DayOffRepository(_DayRepository[DayOff]):
    """``habits_days_off``."""

    _table = "habits_days_off"
    _row = DayOff


def summarize_habits(
    conn: sqlite3.Connection, ids: Sequence[str]
) -> dict[str, tuple[str, bool, str]]:
    """Name, deleted flag and context hint per habit id (for core links/search)."""
    result: dict[str, tuple[str, bool, str]] = {}
    for start in range(0, len(ids), _CHUNK):
        chunk = list(ids[start : start + _CHUNK])
        rows = conn.execute(
            "SELECT id, name, deleted_at FROM habits "  # noqa: S608
            f"WHERE id IN ({','.join('?' * len(chunk))})",
            chunk,
        ).fetchall()
        for r in rows:
            result[str(r["id"])] = (str(r["name"]), r["deleted_at"] is not None, "Habit")
    return result


def habit_search_rows(
    conn: sqlite3.Connection, since: str | None
) -> list[tuple[str, str, str, bool, str]]:
    """``(id, name, notes, deleted, updated_at)`` of habits changed at or after ``since``."""
    rows = conn.execute(
        "SELECT id, name, notes, deleted_at, updated_at FROM habits "
        "WHERE :since IS NULL OR updated_at >= :since",
        {"since": since},
    ).fetchall()
    return [
        (
            str(r["id"]),
            str(r["name"]),
            str(r["notes"]),
            r["deleted_at"] is not None,
            str(r["updated_at"]),
        )
        for r in rows
    ]


def habit_activity_rows(conn: sqlite3.Connection, since: str) -> list[tuple[str, str | None]]:
    """``(created_at, deleted_at)`` of habits created or deleted at/after ``since``."""
    rows = conn.execute(
        "SELECT created_at, deleted_at FROM habits "
        "WHERE created_at >= :since OR deleted_at >= :since",
        {"since": since},
    ).fetchall()
    return [(str(r["created_at"]), r["deleted_at"]) for r in rows]


def checkin_instants(conn: sqlite3.Connection, since: str) -> list[str]:
    """When each live check-in was made, at/after ``since`` (not the day it counts for)."""
    rows = conn.execute(
        "SELECT created_at FROM habits_checkins WHERE deleted_at IS NULL AND created_at >= ?",
        (since,),
    ).fetchall()
    return [str(r["created_at"]) for r in rows]
