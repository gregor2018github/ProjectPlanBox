"""HTTP shapes for backups, export and import."""

from typing import Literal

from pydantic import BaseModel, Field

EXPORT_FORMAT = "planbox-export"
EXPORT_FORMAT_VERSION = 1


class BackupOut(BaseModel):
    """One local backup."""

    name: str
    label: str = Field(description="daily, weekly, manual, pre-import or pre-migration.")
    taken_at: str
    size: int = Field(description="Bytes.")


class OffsiteOut(BaseModel):
    """The off-site backup folder."""

    path: str
    reachable: bool = Field(description="Whether the folder exists right now.")
    latest_at: str | None = Field(description="The newest backup there.")
    error: str | None = Field(description="Why the last copy failed, until one succeeds.")


class BackupsOut(BaseModel):
    """The local backups, newest first, and the off-site folder (null when not set)."""

    backups: list[BackupOut]
    offsite: OffsiteOut | None
    scheduled: bool = Field(description="Whether daily and weekly backups run by themselves.")


class BackupCreate(BaseModel):
    """Body of a manual backup request (a JSON body keeps it same-site only).

    Attributes:
        confirm: Must be ``true``.
    """

    confirm: Literal[True]


class MigrationStampIO(BaseModel):
    """One applied migration."""

    owner: str
    version: int
    checksum: str


class TableDumpIO(BaseModel):
    """Every row of one table; each row lists its values in ``columns`` order."""

    columns: list[str]
    rows: list[list[str | int | float | None]]


class ExportFile(BaseModel):
    """A whole PlanBox database as JSON: the export file, and the import body."""

    format: Literal["planbox-export"]
    format_version: Literal[1]
    app_version: str
    exported_at: str
    migrations: list[MigrationStampIO]
    tables: dict[str, TableDumpIO]


class TableMergeOut(BaseModel):
    """What merging one table did."""

    table: str
    inserted: int
    updated: int
    unchanged: int
    conflicts: int = Field(
        description="Rows that duplicated a live row here (same name, same day) and were "
        "stored deleted."
    )


class ImportOut(BaseModel):
    """The outcome of an import."""

    backup: str = Field(description="The backup taken just before the import.")
    tables: list[TableMergeOut]
