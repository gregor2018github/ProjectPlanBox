"""HTTP routes for the habits module, mounted at ``/api/habits``."""

from datetime import date
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query, Response, status

from planbox.core.db.deps import ClockDep, ConnectionDep, SettingsDep
from planbox.core.errors import ValidationFailed
from planbox.modules.habits.models import Habit, HabitView
from planbox.modules.habits.schemas import (
    CheckinOut,
    HabitCreate,
    HabitDeletedOut,
    HabitOut,
    HabitOverviewOut,
    HabitPatch,
)
from planbox.modules.habits.service import HabitService, NewHabit, Repositories

router = APIRouter()


def _habits(conn: ConnectionDep, clock: ClockDep, settings: SettingsDep) -> HabitService:
    return HabitService(conn, Repositories.on(conn), clock, ZoneInfo(settings.timezone))


Habits = Annotated[HabitService, Depends(_habits)]


def _habit(habit: Habit) -> HabitOut:
    return HabitOut.model_validate(habit, from_attributes=True)


def _overview(view: HabitView) -> HabitOverviewOut:
    return HabitOverviewOut(
        **_habit(view.habit).model_dump(),
        checkins=view.checkins,
        scheduled=view.scheduled,
        current_streak=view.current_streak,
        best_streak=view.best_streak,
        total_checkins=view.total_checkins,
    )


@router.get("/habits")
def list_habits(
    service: Habits,
    start: Annotated[date, Query(description="First day of the range (YYYY-MM-DD).")],
    end: Annotated[date, Query(description="Last day of the range, inclusive.")],
) -> list[HabitOverviewOut]:
    """All live habits in order, with their days in the range and their streaks."""
    return [_overview(v) for v in service.overview(start, end)]


@router.post("/habits", status_code=status.HTTP_201_CREATED)
def create_habit(body: HabitCreate, service: Habits, response: Response) -> HabitOut:
    """Creates a habit (idempotent per client id)."""
    habit, created = service.create(
        NewHabit(
            name=body.name,
            id=body.id,
            notes=body.notes,
            rrule=body.rrule,
            start_date=body.start_date,
        )
    )
    if not created:
        response.status_code = status.HTTP_200_OK
    return _habit(habit)


@router.patch("/habits/{habit_id}")
def update_habit(habit_id: str, body: HabitPatch, service: Habits) -> HabitOut:
    """Changes the fields present in the body."""
    changes = {name: getattr(body, name) for name in body.model_fields_set}
    for required in ("name", "notes", "rrule", "start_date"):
        if required in changes and changes[required] is None:
            raise ValidationFailed(f"{required} cannot be null.")
    return _habit(service.update(habit_id, changes))


@router.delete("/habits/{habit_id}")
def delete_habit(habit_id: str, service: Habits) -> HabitDeletedOut:
    """Deletes a habit (undo with restore)."""
    return HabitDeletedOut(id=habit_id, deleted_at=service.delete(habit_id))


@router.post("/habits/{habit_id}/restore")
def restore_habit(habit_id: str, service: Habits) -> HabitOut:
    """Undoes a delete, with the habit's history."""
    return _habit(service.restore(habit_id))


@router.put("/habits/{habit_id}/checkins/{day}")
def check_habit(habit_id: str, day: date, service: Habits) -> CheckinOut:
    """Marks the habit done on a day (idempotent; not in the future)."""
    service.check(habit_id, day)
    return CheckinOut(habit_id=habit_id, day=day.isoformat(), checked=True)


@router.delete("/habits/{habit_id}/checkins/{day}")
def uncheck_habit(habit_id: str, day: date, service: Habits) -> CheckinOut:
    """Removes the day's check-in (idempotent)."""
    service.uncheck(habit_id, day)
    return CheckinOut(habit_id=habit_id, day=day.isoformat(), checked=False)
