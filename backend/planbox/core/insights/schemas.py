"""HTTP shapes for insights."""

from datetime import date

from pydantic import BaseModel, Field


class AppOpenCreate(BaseModel):
    """Record that the app was opened; send a client ``id`` so a retry counts once."""

    id: str | None = None


class AppOpenOut(BaseModel):
    """A recorded app open."""

    id: str
    created_at: str


class DayActivityOut(BaseModel):
    """Counts for one local day (days without any activity are left out)."""

    date: date
    created: int
    completed: int
    deleted: int
    opens: int


class TypeActivityOut(BaseModel):
    """Totals of one entity type over the range."""

    entity_type: str = Field(description="For example todos.todo.")
    created: int
    completed: int
    deleted: int


class OpenStatsOut(BaseModel):
    """App opens in the range by local hour and weekday, plus all-time facts."""

    in_range: int
    all_time: int
    first_at: str | None = Field(description="The first recorded app open, if any.")
    by_hour: list[int] = Field(description="24 counts, local hour 0..23.")
    by_weekday: list[int] = Field(description="7 counts, Monday first.")


class ActivityOut(BaseModel):
    """Activity across every module, per local day in the configured zone."""

    start: date
    end: date
    days: list[DayActivityOut]
    types: list[TypeActivityOut]
    opens: OpenStatsOut
