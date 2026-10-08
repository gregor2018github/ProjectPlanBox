"""SQL for the todos module. Repositories never commit; services own transactions."""

import dataclasses
import sqlite3
from collections.abc import Mapping, Sequence

from planbox.modules.todos.models import Area, Section, Todo, TodoList

_AREA = "id, name, position, created_at, updated_at, deleted_at"
_LIST = "id, area_id, name, position, created_at, updated_at, deleted_at"
_SECTION = "id, list_id, name, position, created_at, updated_at, deleted_at"
_TODO = (
    "id, list_id, section_id, parent_id, title, notes, priority, due_date, position, "
    "completed_at, created_at, updated_at, deleted_at"
)
_TODO_EDITABLE = frozenset(
    {"title", "notes", "priority", "due_date", "list_id", "section_id", "parent_id", "position"}
)

type Positions = list[tuple[str, str]]
"""(id, position) pairs in display order."""


def _positions(rows: Sequence[sqlite3.Row]) -> Positions:
    return [(str(r["id"]), str(r["position"])) for r in rows]


class AreaRepository:
    """``todos_areas``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, area_id: str) -> Area | None:
        """An area by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_AREA} FROM todos_areas WHERE id = ?",  # noqa: S608
            (area_id,),
        ).fetchone()
        return None if row is None else Area(**dict(row))

    def list_live(self) -> list[Area]:
        """Live areas in order."""
        rows = self._conn.execute(
            f"SELECT {_AREA} FROM todos_areas WHERE deleted_at IS NULL ORDER BY position, id"  # noqa: S608
        ).fetchall()
        return [Area(**dict(r)) for r in rows]

    def positions(self, exclude_id: str | None = None) -> Positions:
        """Positions of live areas."""
        rows = self._conn.execute(
            "SELECT id, position FROM todos_areas WHERE deleted_at IS NULL AND id IS NOT ? "
            "ORDER BY position, id",
            (exclude_id,),
        ).fetchall()
        return _positions(rows)

    def insert(self, area: Area) -> None:
        """Inserts an area."""
        self._conn.execute(
            f"INSERT INTO todos_areas ({_AREA}) "  # noqa: S608
            "VALUES (:id, :name, :position, :created_at, :updated_at, :deleted_at)",
            _asdict(area),
        )

    def update(self, area_id: str, fields: Mapping[str, object], now: str) -> None:
        """Updates name and/or position."""
        _update(self._conn, "todos_areas", area_id, fields, allowed={"name", "position"}, now=now)

    def set_deleted(self, area_id: str, deleted_at: str | None, now: str) -> None:
        """Soft-deletes (or, with ``None``, restores) one area."""
        self._conn.execute(
            "UPDATE todos_areas SET deleted_at = ?, updated_at = ? WHERE id = ?",
            (deleted_at, now, area_id),
        )


class ListRepository:
    """``todos_lists``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, list_id: str) -> TodoList | None:
        """A list by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_LIST} FROM todos_lists WHERE id = ?",  # noqa: S608
            (list_id,),
        ).fetchone()
        return None if row is None else TodoList(**dict(row))

    def list_live(self) -> list[TodoList]:
        """Live lists, grouped by area, in order."""
        rows = self._conn.execute(
            f"SELECT {_LIST} FROM todos_lists WHERE deleted_at IS NULL "  # noqa: S608
            "ORDER BY area_id IS NOT NULL, area_id, position, id"
        ).fetchall()
        return [TodoList(**dict(r)) for r in rows]

    def positions(self, area_id: str | None, exclude_id: str | None = None) -> Positions:
        """Positions of live lists in an area (``None`` = outside any area)."""
        rows = self._conn.execute(
            "SELECT id, position FROM todos_lists "
            "WHERE deleted_at IS NULL AND area_id IS ? AND id IS NOT ? ORDER BY position, id",
            (area_id, exclude_id),
        ).fetchall()
        return _positions(rows)

    def live_ids_in_area(self, area_id: str) -> list[str]:
        """Ids of live lists in an area."""
        rows = self._conn.execute(
            "SELECT id FROM todos_lists WHERE deleted_at IS NULL AND area_id = ?", (area_id,)
        ).fetchall()
        return [str(r["id"]) for r in rows]

    def ids_deleted_with(self, area_id: str, deleted_at: str) -> list[str]:
        """Ids of lists deleted together with an area."""
        rows = self._conn.execute(
            "SELECT id FROM todos_lists WHERE area_id = ? AND deleted_at = ?", (area_id, deleted_at)
        ).fetchall()
        return [str(r["id"]) for r in rows]

    def insert(self, todo_list: TodoList) -> None:
        """Inserts a list."""
        self._conn.execute(
            f"INSERT INTO todos_lists ({_LIST}) "  # noqa: S608
            "VALUES (:id, :area_id, :name, :position, :created_at, :updated_at, :deleted_at)",
            _asdict(todo_list),
        )

    def update(self, list_id: str, fields: Mapping[str, object], now: str) -> None:
        """Updates name, area and/or position."""
        _update(
            self._conn,
            "todos_lists",
            list_id,
            fields,
            allowed={"name", "area_id", "position"},
            now=now,
        )

    def set_deleted(self, list_ids: Sequence[str], deleted_at: str | None, now: str) -> int:
        """Soft-deletes (or restores) lists; returns how many rows changed."""
        return _set_deleted(self._conn, "todos_lists", list_ids, deleted_at, now)


class SectionRepository:
    """``todos_sections``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, section_id: str) -> Section | None:
        """A section by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_SECTION} FROM todos_sections WHERE id = ?",  # noqa: S608
            (section_id,),
        ).fetchone()
        return None if row is None else Section(**dict(row))

    def list_live(self) -> list[Section]:
        """Live sections, grouped by list, in order."""
        rows = self._conn.execute(
            f"SELECT {_SECTION} FROM todos_sections WHERE deleted_at IS NULL "  # noqa: S608
            "ORDER BY list_id, position, id"
        ).fetchall()
        return [Section(**dict(r)) for r in rows]

    def positions(self, list_id: str, exclude_id: str | None = None) -> Positions:
        """Positions of live sections in a list."""
        rows = self._conn.execute(
            "SELECT id, position FROM todos_sections "
            "WHERE deleted_at IS NULL AND list_id = ? AND id IS NOT ? ORDER BY position, id",
            (list_id, exclude_id),
        ).fetchall()
        return _positions(rows)

    def live_ids_in_lists(self, list_ids: Sequence[str]) -> list[str]:
        """Ids of live sections in any of the lists."""
        return _ids_where(self._conn, "todos_sections", "list_id", list_ids, None)

    def ids_deleted_with(self, list_ids: Sequence[str], deleted_at: str) -> list[str]:
        """Ids of sections in these lists deleted at ``deleted_at``."""
        return _ids_where(self._conn, "todos_sections", "list_id", list_ids, deleted_at)

    def insert(self, section: Section) -> None:
        """Inserts a section."""
        self._conn.execute(
            f"INSERT INTO todos_sections ({_SECTION}) "  # noqa: S608
            "VALUES (:id, :list_id, :name, :position, :created_at, :updated_at, :deleted_at)",
            _asdict(section),
        )

    def update(self, section_id: str, fields: Mapping[str, object], now: str) -> None:
        """Updates name, list and/or position."""
        allowed = {"name", "list_id", "position"}
        _update(self._conn, "todos_sections", section_id, fields, allowed=allowed, now=now)

    def set_deleted(self, section_ids: Sequence[str], deleted_at: str | None, now: str) -> int:
        """Soft-deletes (or restores) sections; returns how many rows changed."""
        return _set_deleted(self._conn, "todos_sections", section_ids, deleted_at, now)


class TodoRepository:
    """``todos``."""

    def __init__(self, conn: sqlite3.Connection) -> None:
        self._conn = conn

    def get(self, todo_id: str) -> Todo | None:
        """A todo by id, live or deleted."""
        row = self._conn.execute(
            f"SELECT {_TODO} FROM todos WHERE id = ?",  # noqa: S608
            (todo_id,),
        ).fetchone()
        return None if row is None else Todo(**dict(row))

    def get_many(self, todo_ids: Sequence[str]) -> list[Todo]:
        """Todos by id (any state), in no particular order."""
        result: list[Todo] = []
        for chunk in _chunks(todo_ids):
            rows = self._conn.execute(
                f"SELECT {_TODO} FROM todos WHERE id IN ({_marks(chunk)})",  # noqa: S608
                chunk,
            ).fetchall()
            result.extend(Todo(**dict(r)) for r in rows)
        return result

    def list_current(self, completed_since: str) -> list[Todo]:
        """Live todos that are open or were completed at/after ``completed_since``."""
        rows = self._conn.execute(
            f"SELECT {_TODO} FROM todos WHERE deleted_at IS NULL "  # noqa: S608
            "AND (completed_at IS NULL OR completed_at >= ?) ORDER BY position, id",
            (completed_since,),
        ).fetchall()
        return [Todo(**dict(r)) for r in rows]

    def list_completed(self, before: tuple[str, str] | None, limit: int) -> list[Todo]:
        """Live completed todos, newest first, strictly before the (completed_at, id) cursor."""
        if before is None:
            rows = self._conn.execute(
                f"SELECT {_TODO} FROM todos WHERE deleted_at IS NULL "  # noqa: S608
                "AND completed_at IS NOT NULL ORDER BY completed_at DESC, id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        else:
            rows = self._conn.execute(
                f"SELECT {_TODO} FROM todos WHERE deleted_at IS NULL "  # noqa: S608
                "AND completed_at IS NOT NULL "
                "AND (completed_at < ? OR (completed_at = ? AND id < ?)) "
                "ORDER BY completed_at DESC, id DESC LIMIT ?",
                (before[0], before[0], before[1], limit),
            ).fetchall()
        return [Todo(**dict(r)) for r in rows]

    def positions(
        self,
        list_id: str | None,
        section_id: str | None,
        parent_id: str | None,
        exclude_id: str | None = None,
    ) -> Positions:
        """Positions of the live siblings in one container."""
        rows = self._conn.execute(
            "SELECT id, position FROM todos WHERE deleted_at IS NULL "
            "AND list_id IS ? AND section_id IS ? AND parent_id IS ? AND id IS NOT ? "
            "ORDER BY position, id",
            (list_id, section_id, parent_id, exclude_id),
        ).fetchall()
        return _positions(rows)

    def live_children(self, parent_id: str) -> list[Todo]:
        """Live subtasks of a todo, in order."""
        rows = self._conn.execute(
            f"SELECT {_TODO} FROM todos WHERE deleted_at IS NULL AND parent_id = ? "  # noqa: S608
            "ORDER BY position, id",
            (parent_id,),
        ).fetchall()
        return [Todo(**dict(r)) for r in rows]

    def live_ids_in(self, column: str, values: Sequence[str]) -> list[str]:
        """Ids of live todos whose ``column`` (list_id/section_id/parent_id) is in ``values``."""
        return _ids_where(self._conn, "todos", _todo_scope(column), values, None)

    def ids_deleted_with(self, column: str, values: Sequence[str], deleted_at: str) -> list[str]:
        """Ids of todos in that scope deleted at ``deleted_at``."""
        return _ids_where(self._conn, "todos", _todo_scope(column), values, deleted_at)

    def insert(self, todo: Todo) -> None:
        """Inserts a todo."""
        self._conn.execute(
            f"INSERT INTO todos ({_TODO}) VALUES ("  # noqa: S608
            ":id, :list_id, :section_id, :parent_id, :title, :notes, :priority, :due_date, "
            ":position, :completed_at, :created_at, :updated_at, :deleted_at)",
            _asdict(todo),
        )

    def update(self, todo_id: str, fields: Mapping[str, object], now: str) -> None:
        """Updates editable columns of one todo."""
        _update(self._conn, "todos", todo_id, fields, allowed=_TODO_EDITABLE, now=now)

    def set_placement_of_children(
        self, parent_id: str, list_id: str | None, section_id: str | None, now: str
    ) -> None:
        """Keeps subtasks in their parent's list and section."""
        self._conn.execute(
            "UPDATE todos SET list_id = ?, section_id = ?, updated_at = ? "
            "WHERE parent_id = ? AND deleted_at IS NULL",
            (list_id, section_id, now, parent_id),
        )

    def set_list_of_section(self, section_id: str, list_id: str, now: str) -> None:
        """Moves every todo of a section along when the section changes list."""
        self._conn.execute(
            "UPDATE todos SET list_id = ?, updated_at = ? "
            "WHERE section_id = ? AND deleted_at IS NULL",
            (list_id, now, section_id),
        )

    def set_completed(self, todo_ids: Sequence[str], completed_at: str | None, now: str) -> None:
        """Completes (or, with ``None``, reopens) todos."""
        for chunk in _chunks(todo_ids):
            self._conn.execute(
                f"UPDATE todos SET completed_at = ?, updated_at = ? WHERE id IN ({_marks(chunk)})",  # noqa: S608
                [completed_at, now, *chunk],
            )

    def set_deleted(self, todo_ids: Sequence[str], deleted_at: str | None, now: str) -> int:
        """Soft-deletes (or restores) todos; returns how many rows changed."""
        return _set_deleted(self._conn, "todos", todo_ids, deleted_at, now)


# ------------------------------------------------------------------ helpers


def _asdict(row: Area | TodoList | Section | Todo) -> dict[str, object]:
    return dataclasses.asdict(row)


def _chunks(values: Sequence[str], size: int = 500) -> list[list[str]]:
    return [list(values[i : i + size]) for i in range(0, len(values), size)]


def _marks(values: Sequence[str]) -> str:
    return ",".join("?" * len(values))


def _todo_scope(column: str) -> str:
    if column not in {"list_id", "section_id", "parent_id"}:
        raise ValueError(f"not a todo scope column: {column}")
    return column


def _ids_where(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    values: Sequence[str],
    deleted_at: str | None,
) -> list[str]:
    """Ids in ``table`` whose ``column`` is in ``values``; live, or deleted at ``deleted_at``."""
    ids: list[str] = []
    state = "deleted_at IS ?"
    for chunk in _chunks(values):
        rows = conn.execute(
            f"SELECT id FROM {table} WHERE {state} AND {column} IN ({_marks(chunk)})",  # noqa: S608
            [deleted_at, *chunk],
        ).fetchall()
        ids.extend(str(r["id"]) for r in rows)
    return ids


def _set_deleted(
    conn: sqlite3.Connection,
    table: str,
    ids: Sequence[str],
    deleted_at: str | None,
    now: str,
) -> int:
    changed = 0
    for chunk in _chunks(ids):
        cursor = conn.execute(
            f"UPDATE {table} SET deleted_at = ?, updated_at = ? WHERE id IN ({_marks(chunk)})",  # noqa: S608
            [deleted_at, now, *chunk],
        )
        changed += cursor.rowcount
    return changed


def _update(
    conn: sqlite3.Connection,
    table: str,
    row_id: str,
    fields: Mapping[str, object],
    *,
    allowed: frozenset[str] | set[str],
    now: str,
) -> None:
    unknown = set(fields) - set(allowed)
    if unknown:
        raise ValueError(f"cannot update {sorted(unknown)} on {table}")
    if not fields:
        return
    assignments = ", ".join(f"{name} = :{name}" for name in fields)
    conn.execute(
        f"UPDATE {table} SET {assignments}, updated_at = :updated_at WHERE id = :id",  # noqa: S608
        {**fields, "updated_at": now, "id": row_id},
    )


def summarize_todos(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, tuple[str, bool]]:
    """Title and deleted flag per todo id (for core tags/links/search)."""
    result: dict[str, tuple[str, bool]] = {}
    for chunk in _chunks(ids):
        rows = conn.execute(
            f"SELECT id, title, deleted_at FROM todos WHERE id IN ({_marks(chunk)})",  # noqa: S608
            chunk,
        ).fetchall()
        for r in rows:
            result[str(r["id"])] = (str(r["title"]), r["deleted_at"] is not None)
    return result
