"""FastAPI dependencies for settings and the request-scoped connection."""

import sqlite3
from collections.abc import Iterator
from typing import Annotated, cast

from fastapi import Depends, Request

from planbox.config import Settings
from planbox.core.clock import Clock
from planbox.core.db.connection import connect


def get_settings(request: Request) -> Settings:
    """Returns the settings the app was created with."""
    return cast("Settings", request.app.state.settings)


def get_clock(request: Request) -> Clock:
    """Returns the app's clock (a fixed one in tests)."""
    return cast("Clock", request.app.state.clock)


def get_connection(request: Request) -> Iterator[sqlite3.Connection]:
    """Opens one connection per request and closes it afterwards."""
    conn = connect(get_settings(request).db_path)
    try:
        yield conn
    finally:
        conn.close()


SettingsDep = Annotated[Settings, Depends(get_settings)]
ClockDep = Annotated[Clock, Depends(get_clock)]
ConnectionDep = Annotated[sqlite3.Connection, Depends(get_connection)]
