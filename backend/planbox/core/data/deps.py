"""FastAPI dependencies for backups, export and import."""

from typing import Annotated, cast

from fastapi import Depends, Request

from planbox.core.data.backups import BackupService, BackupState
from planbox.core.data.repository import DataRepository
from planbox.core.data.transfer import TransferService
from planbox.core.db.deps import ClockDep, ConnectionDep, SettingsDep
from planbox.core.search.deps import SearchServiceDep


def get_backup_state(request: Request) -> BackupState:
    """Returns the app's backup state (shared with the scheduler)."""
    return cast("BackupState", request.app.state.backup_state)


def get_backup_service(
    conn: ConnectionDep,
    settings: SettingsDep,
    clock: ClockDep,
    state: Annotated[BackupState, Depends(get_backup_state)],
) -> BackupService:
    """Builds a backup service on the request's connection."""
    return BackupService(conn, settings, clock, state)


def get_transfer_service(
    conn: ConnectionDep, settings: SettingsDep, clock: ClockDep, search: SearchServiceDep
) -> TransferService:
    """Builds an export/import service on the request's connection."""
    return TransferService(conn, DataRepository(conn), search, clock, settings.backups_dir)


BackupServiceDep = Annotated[BackupService, Depends(get_backup_service)]
TransferServiceDep = Annotated[TransferService, Depends(get_transfer_service)]
