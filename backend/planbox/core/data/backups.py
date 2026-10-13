"""Scheduled, manual and off-site backups."""

import logging
import sqlite3
import threading
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from zoneinfo import ZoneInfo

from planbox.config import Settings
from planbox.core.clock import Clock, to_iso
from planbox.core.data.models import OffsiteStatus
from planbox.core.db.backup import (
    BackupFile,
    backup_database,
    copy_backup,
    list_backups,
    prune_backups,
)

logger = logging.getLogger(__name__)

KEEP: dict[str, int] = {
    "daily": 14,
    "weekly": 8,
    "manual": 10,
    "pre-import": 10,
    "pre-migration": 10,
}
"""How many backups of each label are kept, here and off-site."""

DEFAULT_KEEP = 10


@dataclass(slots=True)
class BackupState:
    """What the app remembers between backup runs (in memory, per process).

    Attributes:
        lock: Serialises backup runs (the schedule and the button).
        offsite_error: Why the last off-site copy failed, until one succeeds.
    """

    lock: threading.Lock = field(default_factory=threading.Lock)
    offsite_error: str | None = None


class BackupService:
    """Takes backups and keeps the off-site folder in step."""

    def __init__(
        self, conn: sqlite3.Connection, settings: Settings, clock: Clock, state: BackupState
    ) -> None:
        self._conn = conn
        self._settings = settings
        self._clock = clock
        self._state = state

    def backups(self) -> list[BackupFile]:
        """The local backups, newest first."""
        return list_backups(self._settings.backups_dir)

    def offsite(self) -> OffsiteStatus | None:
        """The off-site folder's state, or ``None`` when none is configured."""
        folder = self._settings.offsite_backup_dir
        if folder is None:
            return None
        there = list_backups(folder)
        return OffsiteStatus(
            path=folder,
            reachable=folder.is_dir(),
            latest=there[0].taken_at if there else None,
            error=self._state.offsite_error,
        )

    def back_up_now(self) -> BackupFile:
        """Takes a manual backup and copies it off-site."""
        with self._state.lock:
            path = self._take("manual")
            self._mirror()
        return next(b for b in self.backups() if b.path == path)

    def run_schedule(self) -> list[str]:
        """Takes the daily and weekly backups when due, then copies off-site.

        A daily backup is due when none was taken on today's local date; a
        weekly one when none was taken this week (Monday to Sunday). So a PC
        that is on only during office hours still gets one a day.

        Returns:
            The labels taken in this run.
        """
        with self._state.lock:
            zone = ZoneInfo(self._settings.timezone)
            today = self._clock.now().astimezone(zone).date()
            taken: list[str] = []
            for label, same_period in (("daily", _same_day), ("weekly", _same_week)):
                latest = next((b for b in self.backups() if b.label == label), None)
                taken_on = None if latest is None else latest.taken_at.astimezone(zone).date()
                if taken_on is None or not same_period(taken_on, today):
                    self._take(label)
                    taken.append(label)
            self._mirror()
        return taken

    def _take(self, label: str) -> Path:
        return backup_database(
            self._conn,
            self._settings.backups_dir,
            label=label,
            stamp=to_iso(self._clock.now()),
            keep=KEEP.get(label, DEFAULT_KEEP),
        )

    def _mirror(self) -> None:
        """Copies local backups missing off-site, then prunes off-site per label.

        Off-site files are never deleted because they are missing here: if
        this disk is lost, the off-site copies are exactly what must survive.
        """
        folder = self._settings.offsite_backup_dir
        if folder is None:
            return
        try:
            if not folder.is_dir():
                if not folder.parent.is_dir():
                    raise FileNotFoundError(f"{folder} is not reachable")
                folder.mkdir()
            there = {b.path.name for b in list_backups(folder)}
            local = self.backups()
            for backup in local:
                if backup.path.name not in there:
                    copy_backup(backup.path, folder)
            for label in {b.label for b in local}:
                prune_backups(folder, label, KEEP.get(label, DEFAULT_KEEP))
        except OSError as exc:
            logger.warning("Off-site backup failed: %s", exc)
            self._state.offsite_error = str(exc)
        else:
            self._state.offsite_error = None


def _same_day(a: date, b: date) -> bool:
    return a == b


def _same_week(a: date, b: date) -> bool:
    return a.isocalendar()[:2] == b.isocalendar()[:2]
