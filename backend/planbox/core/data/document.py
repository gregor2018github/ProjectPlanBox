"""The export file: an ``Export`` as the JSON document that travels between devices.

Download export, Import an export and Google Drive sync all use this one
format, so a file from any device (a PC, the phone app) imports anywhere.
"""

from planbox.core.data.models import Export, ImportReport, MigrationStamp, TableDump
from planbox.core.data.schemas import (
    EXPORT_FORMAT,
    EXPORT_FORMAT_VERSION,
    ExportFile,
    ImportOut,
    MigrationStampIO,
    TableDumpIO,
    TableMergeOut,
)


def to_file(export: Export) -> ExportFile:
    """The export as its JSON document."""
    return ExportFile(
        format=EXPORT_FORMAT,
        format_version=EXPORT_FORMAT_VERSION,
        app_version=export.app_version,
        exported_at=export.exported_at,
        migrations=[
            MigrationStampIO(owner=m.owner, version=m.version, checksum=m.checksum)
            for m in export.migrations
        ],
        tables={
            name: TableDumpIO(columns=list(t.columns), rows=[list(r) for r in t.rows])
            for name, t in export.tables.items()
        },
    )


def from_file(file: ExportFile) -> Export:
    """The export a (validated) JSON document holds."""
    return Export(
        app_version=file.app_version,
        exported_at=file.exported_at,
        migrations=[MigrationStamp(m.owner, m.version, m.checksum) for m in file.migrations],
        tables={
            name: TableDump(tuple(t.columns), [tuple(r) for r in t.rows])
            for name, t in file.tables.items()
        },
    )


def import_out(report: ImportReport) -> ImportOut:
    """The HTTP shape of an import report."""
    return ImportOut(
        backup=report.backup,
        tables=[
            TableMergeOut(
                table=m.table,
                inserted=m.inserted,
                updated=m.updated,
                unchanged=m.unchanged,
                conflicts=m.conflicts,
            )
            for m in report.tables
        ],
    )
