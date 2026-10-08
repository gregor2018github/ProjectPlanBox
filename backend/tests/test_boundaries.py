"""Architecture rules, enforced.

- A module imports only from ``planbox.core`` and itself.
- ``planbox.core`` never imports ``planbox.modules``.
- Tables are prefixed with their owner (``core_*`` or the module id).
- Every table has ``id``, ``created_at``, ``updated_at`` and ``deleted_at``.
"""

import ast
import re
import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest

from planbox.main import CORE_MIGRATIONS_DIR
from planbox.modules import ENABLED_MODULES

PACKAGE = Path(__file__).resolve().parents[1] / "planbox"
MODULES_DIR = PACKAGE / "modules"
CORE_DIR = PACKAGE / "core"
REQUIRED_COLUMNS = {"id", "created_at", "updated_at", "deleted_at"}
INFRASTRUCTURE_TABLES = {"schema_migrations"}
_CREATE_TABLE_RE = re.compile(
    r"CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\"`\[]?(\w+)", re.IGNORECASE
)


def imported_modules(path: Path, package: str) -> Iterator[str]:
    """Absolute names of everything a file imports (relative imports resolved)."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            yield from (alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                base = package.split(".")[: len(package.split(".")) - node.level + 1]
                yield ".".join([*base, node.module] if node.module else base)
            elif node.module:
                yield node.module


def package_of(path: Path) -> str:
    """Dotted package name of a source file."""
    relative = path.relative_to(PACKAGE.parent).with_suffix("")
    parts = list(relative.parts)
    return ".".join(parts if path.name == "__init__.py" else parts[:-1]).removesuffix(".__init__")


def module_violations(module_dir: Path) -> list[str]:
    """Imports from a module folder that reach into another module."""
    own = f"planbox.modules.{module_dir.name}"
    problems: list[str] = []
    for path in module_dir.rglob("*.py"):
        for name in imported_modules(path, package_of(path)):
            if name.startswith("planbox.modules") and not (
                name == own or name.startswith(own + ".")
            ):
                problems.append(f"{path.relative_to(PACKAGE).as_posix()} imports {name}")
    return problems


def core_violations(core_dir: Path) -> list[str]:
    """Imports from core that reach into modules."""
    problems: list[str] = []
    for path in core_dir.rglob("*.py"):
        for name in imported_modules(path, package_of(path)):
            if name.startswith("planbox.modules"):
                problems.append(f"{path.relative_to(PACKAGE).as_posix()} imports {name}")
    return problems


def prefix_violations(owner: str, migrations_dir: Path) -> list[str]:
    """Tables created by an owner's migrations that lack the owner's prefix."""
    prefix = "core_" if owner == "core" else owner
    problems: list[str] = []
    for path in migrations_dir.glob("*.sql"):
        for table in _CREATE_TABLE_RE.findall(path.read_text(encoding="utf-8")):
            if not table.startswith(prefix):
                problems.append(f"{owner}/{path.name} creates {table} (needs prefix {prefix!r})")
    return problems


def column_violations(conn: sqlite3.Connection) -> list[str]:
    """Tables missing one of the required sync/soft-delete columns."""
    problems: list[str] = []
    rows = conn.execute(
        "SELECT name, sql FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    for row in rows:
        name, sql = str(row["name"]), str(row["sql"] or "")
        if name in INFRASTRUCTURE_TABLES or sql.upper().startswith("CREATE VIRTUAL TABLE"):
            continue
        if "_" in name and any(
            name.startswith(str(v["name"]) + "_")
            for v in rows
            if str(v["sql"] or "").upper().startswith("CREATE VIRTUAL TABLE")
        ):
            continue  # FTS5 shadow tables
        columns = {str(c["name"]) for c in conn.execute(f'PRAGMA table_info("{name}")')}
        missing = REQUIRED_COLUMNS - columns
        if missing:
            problems.append(f"{name} lacks {sorted(missing)}")
    return problems


# --------------------------------------------------------------- the real code


def test_modules_only_import_core_and_themselves() -> None:
    """No module reaches into another module."""
    problems = [p for d in MODULES_DIR.iterdir() if d.is_dir() for p in module_violations(d)]
    assert problems == []


def test_core_never_imports_modules() -> None:
    """Core stays independent of every feature module."""
    assert core_violations(CORE_DIR) == []


def test_tables_carry_their_owner_prefix() -> None:
    """Each owner creates only tables with its prefix."""
    problems = prefix_violations("core", CORE_MIGRATIONS_DIR)
    for module in ENABLED_MODULES:
        problems += prefix_violations(module.id, module.migrations_dir)
    assert problems == []


def test_every_table_has_sync_columns(db: sqlite3.Connection) -> None:
    """id, created_at, updated_at and deleted_at exist on every table."""
    assert column_violations(db) == []


# ------------------------------------------------------- the checkers themselves


def test_checker_flags_cross_module_imports(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The import rule really catches absolute and relative violations."""
    fake_package = tmp_path / "planbox"
    todos = fake_package / "modules" / "todos"
    todos.mkdir(parents=True)
    (todos / "__init__.py").write_text("", encoding="utf-8")
    (todos / "service.py").write_text(
        "from planbox.modules.notes import service\nfrom ..notes import repository\n"
        "from planbox.modules.todos import models\nfrom . import models\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(f"{__name__}.PACKAGE", fake_package)

    problems = module_violations(todos)

    assert problems == [
        "modules/todos/service.py imports planbox.modules.notes",
        "modules/todos/service.py imports planbox.modules.notes",
    ]


def test_checker_flags_missing_columns_and_prefixes(tmp_path: Path) -> None:
    """The table rules really catch violations."""
    folder = tmp_path / "m"
    folder.mkdir()
    (folder / "0001_x.sql").write_text(
        "CREATE TABLE notes (id TEXT);\nCREATE TABLE IF NOT EXISTS todos_ok (id TEXT);",
        encoding="utf-8",
    )
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE todos_bad (id TEXT, created_at TEXT)")
    conn.execute("CREATE VIRTUAL TABLE core_search USING fts5(title)")

    try:
        assert prefix_violations("todos", folder) == [
            "todos/0001_x.sql creates notes (needs prefix 'todos')"
        ]
        assert column_violations(conn) == ["todos_bad lacks ['deleted_at', 'updated_at']"]
    finally:
        conn.close()
