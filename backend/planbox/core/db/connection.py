"""Connection factory and explicit transactions."""

import sqlite3
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

BUSY_TIMEOUT_MS = 5000


def connect(path: Path) -> sqlite3.Connection:
    """Opens a connection with PlanBox's per-connection settings.

    The connection runs in autocommit mode; use ``transaction()`` for atomic
    work. ``check_same_thread`` is off because FastAPI may run a request's
    dependency and handler on different threadpool threads; a connection is
    still only ever used by one request at a time.

    Args:
        path: Database file. Its parent directory must exist.

    Returns:
        An open connection with ``sqlite3.Row`` rows.
    """
    conn = sqlite3.connect(path, autocommit=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def init_database(path: Path) -> None:
    """Creates the database file if needed and switches it to WAL mode.

    WAL mode is persistent, so this only has to run once per file; running it
    again is harmless.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
    finally:
        conn.close()


@contextmanager
def transaction(conn: sqlite3.Connection) -> Generator[sqlite3.Connection]:
    """Runs the block in a ``BEGIN IMMEDIATE`` transaction.

    Commits on success and rolls back on any exception. If a transaction is
    already open, the block joins it, so services can call each other.

    Yields:
        The same connection.
    """
    if conn.in_transaction:
        yield conn
        return
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")
