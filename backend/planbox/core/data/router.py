"""HTTP routes for backups, export and import."""

from fastapi import APIRouter, Response, status

from planbox.core.clock import to_iso
from planbox.core.data.deps import BackupServiceDep, TransferServiceDep
from planbox.core.data.document import from_file, import_out, to_file
from planbox.core.data.schemas import (
    BackupCreate,
    BackupOut,
    BackupsOut,
    ExportFile,
    ImportOut,
    OffsiteOut,
)
from planbox.core.db.backup import BackupFile
from planbox.core.db.deps import SettingsDep

router = APIRouter(prefix="/data", tags=["core"])


def _backup_out(backup: BackupFile) -> BackupOut:
    return BackupOut(
        name=backup.path.name,
        label=backup.label,
        taken_at=to_iso(backup.taken_at),
        size=backup.size,
    )


@router.get("/backups")
def list_backups(service: BackupServiceDep, settings: SettingsDep) -> BackupsOut:
    """The local backups, newest first, and the off-site folder's state."""
    offsite = service.offsite()
    return BackupsOut(
        backups=[_backup_out(b) for b in service.backups()],
        offsite=None
        if offsite is None
        else OffsiteOut(
            path=str(offsite.path),
            reachable=offsite.reachable,
            latest_at=None if offsite.latest is None else to_iso(offsite.latest),
            error=offsite.error,
        ),
        scheduled=settings.scheduled_backups,
    )


@router.post("/backups", status_code=status.HTTP_201_CREATED)
def create_backup(_: BackupCreate, service: BackupServiceDep) -> BackupOut:
    """Takes a backup now and copies it to the off-site folder (if set)."""
    return _backup_out(service.back_up_now())


@router.get("/export")
def export_data(service: TransferServiceDep, response: Response) -> ExportFile:
    """Every row of every table as JSON, deleted ones included, as a download."""
    export = service.export()
    compact = export.exported_at.replace("-", "").replace(":", "").replace(".", "")
    response.headers["Content-Disposition"] = (
        f'attachment; filename="planbox-export-{compact}.json"'
    )
    return to_file(export)


@router.post("/import")
def import_data(body: ExportFile, service: TransferServiceDep) -> ImportOut:
    """Merges an export into this database: per row, the newer version wins.

    A backup is taken first; the merge applies completely or not at all.
    """
    return import_out(service.import_export(from_file(body)))
