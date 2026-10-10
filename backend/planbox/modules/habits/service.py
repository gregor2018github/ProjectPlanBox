"""Habit use cases: habits, their schedules, check-ins and streaks.

Rules (ARCHITECTURE §7c): a habit's schedule is an RRULE on floating dates,
anchored on its start date. Check-ins are floating dates in the configured
zone, never in the future. Deleting a habit keeps its check-ins, so a
restore brings its history back.
"""

import re
import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from planbox.core import recurrence
from planbox.core.clock import Clock, utc_now_iso
from planbox.core.db import transaction
from planbox.core.errors import NotFound, ValidationFailed
from planbox.core.ids import is_valid_id, new_id
from planbox.core.placement import free_position, place
from planbox.modules.habits.models import Checkin, Habit, HabitView
from planbox.modules.habits.repository import CheckinRepository, HabitRepository
from planbox.modules.habits.streaks import streaks

ENTITY_TYPE = "habits.habit"
DEFAULT_RULE = "FREQ=DAILY"
MAX_NAME = 200
MAX_NOTES = 20_000
MAX_RANGE_DAYS = 400
_WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True, slots=True)
class Repositories:
    """The module's repositories on one connection."""

    habits: HabitRepository
    checkins: CheckinRepository

    @classmethod
    def on(cls, conn: sqlite3.Connection) -> "Repositories":
        """Builds all repositories on ``conn``."""
        return cls(HabitRepository(conn), CheckinRepository(conn))


@dataclass(frozen=True, slots=True)
class NewHabit:
    """Input for creating a habit (schedule defaults to daily from today)."""

    name: str
    id: str | None = None
    notes: str = ""
    rrule: str | None = None
    start_date: date | None = None


def _name(text: str) -> str:
    cleaned = _WHITESPACE.sub(" ", text).strip()
    if not cleaned:
        raise ValidationFailed("A habit needs a name.")
    if len(cleaned) > MAX_NAME:
        raise ValidationFailed(f"Names are at most {MAX_NAME} characters.")
    return cleaned


def _notes(text: str) -> str:
    if len(text) > MAX_NOTES:
        raise ValidationFailed(f"Notes are at most {MAX_NOTES} characters.")
    return text


def _live(habit: Habit | None) -> Habit:
    if habit is None or habit.deleted_at is not None:
        raise NotFound("No habit with this id.")
    return habit


def _midnight(day: date) -> datetime:
    return datetime.combine(day, time())


class HabitService:
    """Habits and their check-ins."""

    def __init__(
        self, conn: sqlite3.Connection, repos: Repositories, clock: Clock, zone: ZoneInfo
    ) -> None:
        self._conn = conn
        self._repos = repos
        self._clock = clock
        self._zone = zone

    # ---- reads

    def overview(self, start: date, end: date) -> list[HabitView]:
        """Live habits with their days in ``[start, end]`` and their streaks.

        Raises:
            ValidationFailed: If the range is reversed or longer than 400 days.
        """
        if end < start:
            raise ValidationFailed("The range ends before it starts.")
        if (end - start).days >= MAX_RANGE_DAYS:
            raise ValidationFailed(f"Ask for at most {MAX_RANGE_DAYS} days at a time.")
        habits = self._repos.habits.list_live()
        days = self._repos.checkins.live_days([h.id for h in habits])
        today = self._today()
        return [self._view(h, days[h.id], start, end, today) for h in habits]

    # ---- writes

    def create(self, new: NewHabit) -> tuple[Habit, bool]:
        """Creates a habit at the end of the list; idempotent per client id.

        Returns:
            The habit and whether it was newly created.

        Raises:
            ValidationFailed: If a field is invalid.
        """
        if new.id is not None and not is_valid_id(new.id):
            raise ValidationFailed("Ids must be lowercase UUIDv7.")
        name, notes = _name(new.name), _notes(new.notes)
        start = new.start_date or self._today()
        rule = self._normalize(new.rrule or DEFAULT_RULE, start)
        with transaction(self._conn):
            if new.id is not None and (existing := self._repos.habits.get(new.id)) is not None:
                return existing, False
            now = utc_now_iso(self._clock)
            habit = Habit(
                id=new.id or new_id(),
                name=name,
                notes=notes,
                rrule=rule,
                start_date=start.isoformat(),
                position=place(self._repos.habits.positions(), None, None),
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            self._repos.habits.insert(habit)
            return habit, True

    def update(self, habit_id: str, changes: Mapping[str, object]) -> Habit:
        """Changes name, notes, schedule and/or start date.

        A new start date re-anchors the schedule, so the rule is checked again.

        Raises:
            NotFound: If there is no live habit with this id.
            ValidationFailed: If a field is invalid.
        """
        with transaction(self._conn):
            habit = _live(self._repos.habits.get(habit_id))
            fields: dict[str, object] = {}
            if "name" in changes:
                fields["name"] = _name(str(changes["name"]))
            if "notes" in changes:
                fields["notes"] = _notes(str(changes["notes"]))
            if "start_date" in changes or "rrule" in changes:
                start_value = changes.get("start_date")
                start = (
                    start_value
                    if isinstance(start_value, date)
                    else date.fromisoformat(habit.start_date)
                )
                rule = str(changes.get("rrule") or habit.rrule)
                fields["start_date"] = start.isoformat()
                fields["rrule"] = self._normalize(rule, start)
            self._repos.habits.update(habit_id, fields, utc_now_iso(self._clock))
            return _live(self._repos.habits.get(habit_id))

    def delete(self, habit_id: str) -> str:
        """Deletes a habit (its check-ins stay for a restore); returns the stamp.

        Raises:
            NotFound: If there is no live habit with this id.
        """
        with transaction(self._conn):
            _live(self._repos.habits.get(habit_id))
            now = utc_now_iso(self._clock)
            self._repos.habits.set_deleted(habit_id, now, now)
            return now

    def restore(self, habit_id: str) -> Habit:
        """Undoes a delete, with the habit's history.

        Raises:
            NotFound: If there is no deleted habit with this id.
        """
        with transaction(self._conn):
            habit = self._repos.habits.get(habit_id)
            if habit is None or habit.deleted_at is None:
                raise NotFound("No deleted habit with this id.")
            now = utc_now_iso(self._clock)
            position = free_position(self._repos.habits.positions(), habit.position)
            self._repos.habits.set_deleted(habit_id, None, now)
            self._repos.habits.update(habit_id, {"position": position}, now)
            return _live(self._repos.habits.get(habit_id))

    def check(self, habit_id: str, day: date) -> Checkin:
        """Marks a habit done on a day; checking a checked day changes nothing.

        A day before the habit's start date moves the start back to it, so
        catching up on the days before a habit was added counts for streaks.

        Raises:
            NotFound: If there is no live habit with this id.
            ValidationFailed: If the day is in the future.
        """
        if day > self._today():
            raise ValidationFailed("You cannot check off a day that has not come yet.")
        with transaction(self._conn):
            habit = _live(self._repos.habits.get(habit_id))
            now = utc_now_iso(self._clock)
            if day < date.fromisoformat(habit.start_date):
                self._move_start(habit, day, now)
            existing = self._repos.checkins.live_on(habit_id, day.isoformat())
            if existing is not None:
                return existing
            checkin = Checkin(
                id=new_id(),
                habit_id=habit_id,
                day=day.isoformat(),
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            self._repos.checkins.insert(checkin)
            return checkin

    def uncheck(self, habit_id: str, day: date) -> None:
        """Removes the check-in of a day; an unchecked day stays unchecked.

        Raises:
            NotFound: If there is no live habit with this id.
        """
        with transaction(self._conn):
            _live(self._repos.habits.get(habit_id))
            existing = self._repos.checkins.live_on(habit_id, day.isoformat())
            if existing is not None:
                now = utc_now_iso(self._clock)
                self._repos.checkins.set_deleted(existing.id, now, now)

    # ---- helpers

    def _today(self) -> date:
        return self._clock.now().astimezone(self._zone).date()

    def _move_start(self, habit: Habit, start: date, now: str) -> None:
        """Re-anchors the schedule on an earlier start (kept as is if the rule no longer fits)."""
        try:
            rule = self._normalize(habit.rrule, start)
        except ValidationFailed:
            return
        self._repos.habits.update(habit.id, {"start_date": start.isoformat(), "rrule": rule}, now)

    def _normalize(self, rule: str, start: date) -> str:
        try:
            return recurrence.normalize(rule, recurrence.all_day_anchor(start, start), self._zone)
        except recurrence.RecurrenceError as exc:
            raise ValidationFailed(str(exc)) from exc

    def _view(
        self, habit: Habit, checked_days: list[str], start: date, end: date, today: date
    ) -> HabitView:
        first = date.fromisoformat(habit.start_date)
        anchor = recurrence.all_day_anchor(first, first)

        def scheduled(lo: date, hi: date) -> list[date]:
            """Scheduled days in ``[lo, hi]``."""
            if hi < lo:
                return []
            spans = recurrence.between(
                habit.rrule, anchor, _midnight(lo), _midnight(hi + timedelta(days=1))
            )
            return [s.occurrence_date for s in spans]

        checked = {date.fromisoformat(d) for d in checked_days}
        current, best = streaks(scheduled(first, today), checked, today)
        return HabitView(
            habit=habit,
            checkins=[d for d in checked_days if start.isoformat() <= d <= end.isoformat()],
            scheduled=[d.isoformat() for d in scheduled(max(start, first), end)],
            current_streak=current,
            best_streak=best,
            total_checkins=len(checked_days),
        )
