"""Shared fixtures: settings on a temp dir, a fixed clock, a migrated DB and an API client."""

import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from planbox.config import Settings
from planbox.core.clock import FixedClock
from planbox.core.db import connect
from planbox.main import create_app, run_migrations
from planbox.modules import ENABLED_MODULES

START = datetime(2026, 10, 8, 12, 0, 0, tzinfo=UTC)


@pytest.fixture
def clock() -> FixedClock:
    """A clock frozen at 2026-10-08 12:00 UTC."""
    return FixedClock(START)


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    """Test settings whose data directory is a fresh temp folder."""
    return Settings(mode="test", data_dir=tmp_path / "data", port=0)


@pytest.fixture
def db(settings: Settings, clock: FixedClock) -> Iterator[sqlite3.Connection]:
    """A connection to a database with every enabled migration applied."""
    run_migrations(settings, ENABLED_MODULES, clock)
    conn = connect(settings.db_path)
    yield conn
    conn.close()


@pytest.fixture
def app(settings: Settings, clock: FixedClock) -> FastAPI:
    """The real app wired to the temp database and the fixed clock."""
    return create_app(settings, clock=clock)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    """A client with the app's lifespan (migrations) running."""
    with TestClient(app) as test_client:
        yield test_client
