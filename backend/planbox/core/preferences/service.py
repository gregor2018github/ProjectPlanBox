"""Preference use cases."""

import sqlite3
from dataclasses import dataclass
from typing import Literal

from planbox.core.clock import Clock, utc_now_iso
from planbox.core.db import transaction
from planbox.core.ids import new_id
from planbox.core.preferences.repository import PreferenceRepository

type Theme = Literal["system", "light", "dark"]

THEMES: tuple[Theme, ...] = ("system", "light", "dark")


@dataclass(frozen=True, slots=True)
class Preferences:
    """Every preference, with defaults filled in.

    Attributes:
        theme: ``system`` follows the device; ``light``/``dark`` pin it everywhere.
    """

    theme: Theme = "system"


class PreferenceService:
    """Reads and changes preferences."""

    def __init__(
        self, conn: sqlite3.Connection, repository: PreferenceRepository, clock: Clock
    ) -> None:
        self._conn = conn
        self._repo = repository
        self._clock = clock

    def get(self) -> Preferences:
        """The current preferences (unknown stored values fall back to defaults)."""
        stored = self._repo.all_live()
        theme = stored.get("theme", "system")
        return Preferences(theme=theme if theme in THEMES else "system")

    def set_theme(self, theme: Theme) -> Preferences:
        """Stores the theme for every device."""
        with transaction(self._conn):
            now = utc_now_iso(self._clock)
            row_id = self._repo.live_id("theme")
            if row_id is None:
                self._repo.insert(new_id(), "theme", theme, now)
            else:
                self._repo.update(row_id, theme, now)
        return self.get()
