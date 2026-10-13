"""The background loop that takes scheduled backups while the server runs."""

import asyncio
import logging

from planbox.config import Settings
from planbox.core.clock import Clock
from planbox.core.data.backups import BackupService, BackupState
from planbox.core.db import connect

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 3600.0
"""How often the loop asks whether a backup is due (and retries off-site)."""


def run_scheduled_backups(settings: Settings, clock: Clock, state: BackupState) -> list[str]:
    """One pass of the schedule on its own connection. Never raises.

    Returns:
        The labels taken (empty if nothing was due or the pass failed).
    """
    conn = connect(settings.db_path)
    try:
        return BackupService(conn, settings, clock, state).run_schedule()
    except Exception:
        # A failed backup must never take the app down; the next pass retries.
        logger.exception("Scheduled backup failed")
        return []
    finally:
        conn.close()


async def backup_loop(
    settings: Settings,
    clock: Clock,
    state: BackupState,
    interval: float = CHECK_INTERVAL_SECONDS,
) -> None:
    """Runs the schedule now and then every ``interval`` seconds until cancelled."""
    while True:
        await asyncio.to_thread(run_scheduled_backups, settings, clock, state)
        await asyncio.sleep(interval)
