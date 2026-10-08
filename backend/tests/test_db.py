"""Connection pragmas and the transaction helper."""

import sqlite3
from collections.abc import Iterator
from pathlib import Path

import pytest

from planbox.core.db import connect, init_database, transaction


@pytest.fixture
def conn(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    """A connection with one scratch table."""
    path = tmp_path / "t.db"
    init_database(path)
    connection = connect(path)
    connection.execute("CREATE TABLE core_items (id TEXT PRIMARY KEY)")
    yield connection
    connection.close()


def count(conn: sqlite3.Connection) -> int:
    """Rows in the scratch table."""
    return int(conn.execute("SELECT COUNT(*) FROM core_items").fetchone()[0])


def test_pragmas_are_set(conn: sqlite3.Connection) -> None:
    """WAL, foreign keys, busy timeout and NORMAL sync are active."""
    assert conn.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert conn.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    assert conn.execute("PRAGMA busy_timeout").fetchone()[0] == 5000
    assert conn.execute("PRAGMA synchronous").fetchone()[0] == 1


def test_transaction_commits(conn: sqlite3.Connection) -> None:
    """Work inside the block is committed."""
    with transaction(conn):
        conn.execute("INSERT INTO core_items (id) VALUES ('a')")

    assert count(conn) == 1
    assert not conn.in_transaction


def test_transaction_rolls_back_on_error(conn: sqlite3.Connection) -> None:
    """An exception undoes the block and propagates."""

    def insert_then_fail() -> None:
        with transaction(conn):
            conn.execute("INSERT INTO core_items (id) VALUES ('a')")
            raise RuntimeError

    with pytest.raises(RuntimeError):
        insert_then_fail()

    assert count(conn) == 0
    assert not conn.in_transaction


def test_nested_transaction_joins_the_outer_one(conn: sqlite3.Connection) -> None:
    """An inner failure caught by the caller still rolls back with the outer block."""

    def nested_then_fail() -> None:
        with transaction(conn):
            conn.execute("INSERT INTO core_items (id) VALUES ('a')")
            with transaction(conn):
                conn.execute("INSERT INTO core_items (id) VALUES ('b')")
            raise RuntimeError

    with pytest.raises(RuntimeError):
        nested_then_fail()

    assert count(conn) == 0
