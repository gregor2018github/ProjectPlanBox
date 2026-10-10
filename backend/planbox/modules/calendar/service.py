"""Calendar use cases: events, recurring series and their occurrences.

A recurring event is one row whose ``rrule`` expands into occurrences on
read. Changing or deleting a single occurrence takes a scope, as in other
calendars:

- ``all``: the whole series (the row itself).
- ``this``: only that occurrence. The series gets an exception for its date
  and, for a change, a detached single event takes its place.
- ``following``: that occurrence and later ones. The series is cut to end
  before it and, for a change, a new series starts there.

Occurrences are keyed by their local start date in the configured zone.
"""

import re
import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from planbox.core import recurrence
from planbox.core.clock import Clock, to_iso, utc_now_iso
from planbox.core.db import transaction
from planbox.core.errors import NotFound, ValidationFailed
from planbox.core.ids import is_valid_id, new_id
from planbox.core.recurrence import Anchor, RecurrenceError, Span
from planbox.modules.calendar.models import CalendarRange, Event, EventException, Occurrence
from planbox.modules.calendar.repository import EventRepository, ExceptionRepository

ENTITY_TYPE = "calendar.event"
MAX_TITLE = 500
MAX_LOCATION = 500
MAX_NOTES = 20_000
MAX_RANGE_DAYS = 100
MAX_SPAN_DAYS = 366
_WHITESPACE = re.compile(r"\s+")
_TIMING_KEYS = frozenset({"all_day", "start_at", "end_at", "start_date", "end_date"})

type Scope = Literal["all", "this", "following"]


@dataclass(frozen=True, slots=True)
class Repositories:
    """The module's repositories on one connection."""

    events: EventRepository
    exceptions: ExceptionRepository

    @classmethod
    def on(cls, conn: sqlite3.Connection) -> "Repositories":
        """Builds all repositories on ``conn``."""
        return cls(EventRepository(conn), ExceptionRepository(conn))


@dataclass(frozen=True, slots=True)
class Timing:
    """When an event (or one occurrence) happens, in storage form."""

    all_day: bool
    start_at: str | None = None
    end_at: str | None = None
    start_date: str | None = None
    end_date: str | None = None


@dataclass(frozen=True, slots=True)
class NewEvent:
    """Input for creating an event. Timing values are already in storage form."""

    title: str
    timing: Timing
    id: str | None = None
    notes: str = ""
    location: str = ""
    rrule: str | None = None


# ------------------------------------------------------------------ helpers


def clean_title(title: str) -> str:
    """Trims a title to one line and checks its length."""
    cleaned = _WHITESPACE.sub(" ", title).strip()
    if not cleaned:
        raise ValidationFailed("An event needs a title.")
    if len(cleaned) > MAX_TITLE:
        raise ValidationFailed(f"Titles are at most {MAX_TITLE} characters.")
    return cleaned


def clean_location(location: str) -> str:
    """Trims a location to one line and checks its length."""
    cleaned = _WHITESPACE.sub(" ", location).strip()
    if len(cleaned) > MAX_LOCATION:
        raise ValidationFailed(f"Locations are at most {MAX_LOCATION} characters.")
    return cleaned


def clean_notes(notes: str) -> str:
    """Checks the notes length (notes keep their line breaks)."""
    if len(notes) > MAX_NOTES:
        raise ValidationFailed(f"Notes are at most {MAX_NOTES} characters.")
    return notes


def instant(value: datetime) -> str:
    """Stores an aware datetime as a UTC instant.

    Raises:
        ValidationFailed: If the datetime has no timezone.
    """
    if value.tzinfo is None:
        raise ValidationFailed("Times need a timezone (use UTC, e.g. ...Z).")
    return to_iso(value)


def check_timing(timing: Timing) -> Timing:
    """Checks that a timing is complete, ordered and not absurdly long."""
    if timing.all_day:
        if timing.start_date is None or timing.end_date is None:
            raise ValidationFailed("An all-day event needs a start and an end date.")
        span = (date.fromisoformat(timing.end_date) - date.fromisoformat(timing.start_date)).days
        if span < 0:
            raise ValidationFailed("An event cannot end before it starts.")
        if span >= MAX_SPAN_DAYS:
            raise ValidationFailed(f"Events last at most {MAX_SPAN_DAYS} days.")
        return Timing(True, start_date=timing.start_date, end_date=timing.end_date)
    if timing.start_at is None or timing.end_at is None:
        raise ValidationFailed("A timed event needs a start and an end time.")
    duration = datetime.fromisoformat(timing.end_at) - datetime.fromisoformat(timing.start_at)
    if duration <= timedelta(0):
        raise ValidationFailed("An event must end after it starts.")
    if duration > timedelta(days=MAX_SPAN_DAYS):
        raise ValidationFailed(f"Events last at most {MAX_SPAN_DAYS} days.")
    return Timing(False, start_at=timing.start_at, end_at=timing.end_at)


def merge_timing(base: Timing, changes: Mapping[str, object]) -> Timing:
    """Applies timing changes; switching between all-day and timed needs the new pair."""
    all_day = changes.get("all_day", base.all_day)
    if not isinstance(all_day, bool):  # pragma: no cover - cleaned before
        raise ValidationFailed("all_day must be true or false.")
    same_kind = all_day == base.all_day

    def pick(key: str, current: str | None) -> str | None:
        value = changes.get(key, current if same_kind else None)
        return value if isinstance(value, str) else None

    if all_day:
        return check_timing(
            Timing(
                True,
                start_date=pick("start_date", base.start_date),
                end_date=pick("end_date", base.end_date),
            )
        )
    return check_timing(
        Timing(False, start_at=pick("start_at", base.start_at), end_at=pick("end_at", base.end_at))
    )


def check_client_id(entity_id: str | None) -> None:
    """Rejects client ids that are not UUIDv7."""
    if entity_id is not None and not is_valid_id(entity_id):
        raise ValidationFailed("Ids must be lowercase UUIDv7.")


def timing_of(event: Event) -> Timing:
    """The stored timing of an event (its series anchor if recurring)."""
    return Timing(event.all_day, event.start_at, event.end_at, event.start_date, event.end_date)


def _live(event: Event | None) -> Event:
    if event is None or event.deleted_at is not None:
        raise NotFound("No event with this id.")
    return event


class EventService:
    """Events, recurring series and their occurrences."""

    def __init__(
        self, conn: sqlite3.Connection, repos: Repositories, clock: Clock, zone: ZoneInfo
    ) -> None:
        self._conn = conn
        self._repos = repos
        self._clock = clock
        self._zone = zone

    # ---- time helpers

    def _anchor(self, timing: Timing) -> Anchor:
        if timing.all_day:
            assert timing.start_date is not None  # noqa: S101
            assert timing.end_date is not None  # noqa: S101
            return recurrence.all_day_anchor(
                date.fromisoformat(timing.start_date), date.fromisoformat(timing.end_date)
            )
        assert timing.start_at is not None  # noqa: S101
        assert timing.end_at is not None  # noqa: S101
        return recurrence.timed_anchor(
            datetime.fromisoformat(timing.start_at),
            datetime.fromisoformat(timing.end_at),
            self._zone,
        )

    def _local_date(self, timing: Timing) -> date:
        """The local date an event (or occurrence) starts on."""
        if timing.all_day:
            assert timing.start_date is not None  # noqa: S101
            return date.fromisoformat(timing.start_date)
        assert timing.start_at is not None  # noqa: S101
        return datetime.fromisoformat(timing.start_at).astimezone(self._zone).date()

    def _midnight_utc(self, day: date) -> datetime:
        return datetime.combine(day, time(), tzinfo=self._zone).astimezone(UTC)

    def _span_timing(self, span: Span, all_day: bool) -> Timing:
        if all_day:
            last = (span.end - timedelta(days=1)).date()
            return Timing(True, start_date=span.start.date().isoformat(), end_date=last.isoformat())
        return Timing(False, start_at=to_iso(span.start), end_at=to_iso(span.end))

    def _normalize_rule(self, rule: str | None, timing: Timing) -> str | None:
        if rule is None or not rule.strip():
            return None
        try:
            return recurrence.normalize(rule, self._anchor(timing), self._zone)
        except RecurrenceError as exc:
            raise ValidationFailed(str(exc)) from exc

    def _occurrence(self, event: Event, day: date | None) -> Timing:
        """The timing of a series' occurrence on ``day``.

        Raises:
            ValidationFailed: If no date was given.
            NotFound: If the series has no (remaining) occurrence on that date.
        """
        if day is None:
            raise ValidationFailed(
                "Name the occurrence (occurrence_date) to change only part of a series."
            )
        assert event.rrule is not None  # noqa: S101
        span = recurrence.occurrence_on(
            event.rrule, self._anchor(timing_of(event)), day, self._zone
        )
        if span is None or self._repos.exceptions.get_live(event.id, day.isoformat()) is not None:
            raise NotFound("This event does not happen on that date.")
        return self._span_timing(span, event.all_day)

    def _is_first(self, event: Event, day: date) -> bool:
        assert event.rrule is not None  # noqa: S101
        return recurrence.count_before(event.rrule, self._anchor(timing_of(event)), day) == 0

    # ---- reads

    def get(self, event_id: str) -> Event:
        """A live event by id."""
        return _live(self._repos.events.get(event_id))

    def in_range(self, start: date, end: date) -> CalendarRange:
        """Events and occurrences in ``[start, end)`` (local dates).

        Raises:
            ValidationFailed: If the range is empty or longer than ``MAX_RANGE_DAYS``.
        """
        days = (end - start).days
        if days <= 0:
            raise ValidationFailed("The range must end after it starts.")
        if days > MAX_RANGE_DAYS:
            raise ValidationFailed(f"Ask for at most {MAX_RANGE_DAYS} days at a time.")
        start_utc, end_utc = self._midnight_utc(start), self._midnight_utc(end)
        singles = self._repos.events.list_single_in_range(
            to_iso(start_utc), to_iso(end_utc), start.isoformat(), end.isoformat()
        )
        series = self._repos.events.list_recurring_before(to_iso(end_utc), end.isoformat())
        skipped: dict[str, set[date]] = {}
        for exc in self._repos.exceptions.live_for([e.id for e in series]):
            skipped.setdefault(exc.event_id, set()).add(date.fromisoformat(exc.occurrence_date))

        events = list(singles)
        occurrences = [self._single_occurrence(e) for e in singles]
        for event in series:
            assert event.rrule is not None  # noqa: S101
            if event.all_day:
                lo = datetime.combine(start, time())
                hi = datetime.combine(end, time())
            else:
                lo, hi = start_utc, end_utc
            spans = recurrence.between(
                event.rrule,
                self._anchor(timing_of(event)),
                lo,
                hi,
                frozenset(skipped.get(event.id, set())),
            )
            if spans:
                events.append(event)
                occurrences.extend(self._series_occurrence(event, s) for s in spans)
        occurrences.sort(key=lambda o: (o.start_date or o.start_at or "", o.event_id))
        return CalendarRange(events, occurrences)

    def _single_occurrence(self, event: Event) -> Occurrence:
        timing = timing_of(event)
        return Occurrence(
            event_id=event.id,
            occurrence_date=self._local_date(timing).isoformat(),
            start_at=timing.start_at,
            end_at=timing.end_at,
            start_date=timing.start_date,
            end_date=timing.end_date,
        )

    def _series_occurrence(self, event: Event, span: Span) -> Occurrence:
        timing = self._span_timing(span, event.all_day)
        return Occurrence(
            event_id=event.id,
            occurrence_date=span.occurrence_date.isoformat(),
            start_at=timing.start_at,
            end_at=timing.end_at,
            start_date=timing.start_date,
            end_date=timing.end_date,
        )

    # ---- writes

    def create(self, new: NewEvent) -> tuple[Event, bool]:
        """Creates an event or series; idempotent per client id."""
        check_client_id(new.id)
        title = clean_title(new.title)
        notes = clean_notes(new.notes)
        location = clean_location(new.location)
        timing = check_timing(new.timing)
        rule = self._normalize_rule(new.rrule, timing)
        with transaction(self._conn):
            if new.id is not None and (existing := self._repos.events.get(new.id)) is not None:
                return existing, False
            event = self._insert(new.id, (title, notes, location), timing, rule)
            return event, True

    def _insert(
        self,
        event_id: str | None,
        text: tuple[str, str, str],
        timing: Timing,
        rule: str | None,
    ) -> Event:
        title, notes, location = text
        now = utc_now_iso(self._clock)
        event = Event(
            id=event_id or new_id(),
            title=title,
            notes=notes,
            location=location,
            all_day=timing.all_day,
            start_at=timing.start_at,
            end_at=timing.end_at,
            start_date=timing.start_date,
            end_date=timing.end_date,
            rrule=rule,
            created_at=now,
            updated_at=now,
            deleted_at=None,
        )
        self._repos.events.insert(event)
        return event

    def update(
        self,
        event_id: str,
        changes: Mapping[str, object],
        scope: Scope = "all",
        occurrence_date: date | None = None,
        split_id: str | None = None,
    ) -> list[Event]:
        """Changes an event, or part of a series (see the module docstring).

        Args:
            event_id: The event or series.
            changes: Fields to change: title, notes, location, rrule and the
                timing fields (``all_day``, ``start_at``/``end_at`` as aware
                datetimes, ``start_date``/``end_date`` as dates). For ``this``
                and ``following`` the timing is that of the occurrence.
            scope: Which part of a series to change; ignored for single events.
            occurrence_date: The occurrence for ``this`` and ``following``.
            split_id: Optional client id for the event split off by ``this``
                or ``following`` (makes optimistic updates exact and retries safe).

        Returns:
            The touched events: the original first, then any split-off event.
        """
        check_client_id(split_id)
        fields = self._clean_changes(changes)
        with transaction(self._conn):
            event = _live(self._repos.events.get(event_id))
            if event.rrule is None or scope == "all":
                return [self._update_all(event, fields)]
            if split_id is not None and (existing := self._repos.events.get(split_id)) is not None:
                return [event, existing]
            occurrence = self._occurrence(event, occurrence_date)
            assert occurrence_date is not None  # noqa: S101
            if scope == "following" and self._is_first(event, occurrence_date):
                return [self._update_all(event, fields)]
            if scope == "this":
                return self._detach(event, occurrence, occurrence_date, fields, split_id)
            return self._split(event, occurrence, occurrence_date, fields, split_id)

    def _clean_changes(self, changes: Mapping[str, object]) -> dict[str, object]:
        fields: dict[str, object] = {}
        for key, value in changes.items():
            match key:
                case "title" if isinstance(value, str):
                    fields["title"] = clean_title(value)
                case "notes" if isinstance(value, str):
                    fields["notes"] = clean_notes(value)
                case "location" if isinstance(value, str):
                    fields["location"] = clean_location(value)
                case "all_day" if isinstance(value, bool):
                    fields["all_day"] = value
                case "start_at" | "end_at" if value is None or isinstance(value, datetime):
                    fields[key] = None if value is None else instant(value)
                case "start_date" | "end_date" if value is None or isinstance(value, date):
                    fields[key] = None if value is None else value.isoformat()
                case "rrule" if value is None or isinstance(value, str):
                    fields["rrule"] = value
                case _:
                    raise ValidationFailed(f"Cannot change {key!r} like that.")
        return fields

    def _update_all(self, event: Event, fields: Mapping[str, object]) -> Event:
        timing = merge_timing(timing_of(event), fields)
        rule_in = fields.get("rrule", event.rrule)
        rule = self._normalize_rule(rule_in if isinstance(rule_in, str) else None, timing)
        now = utc_now_iso(self._clock)
        update: dict[str, object] = {
            k: v for k, v in fields.items() if k not in _TIMING_KEYS and k != "rrule"
        }
        update.update(
            all_day=timing.all_day,
            start_at=timing.start_at,
            end_at=timing.end_at,
            start_date=timing.start_date,
            end_date=timing.end_date,
            rrule=rule,
        )
        self._repos.events.update(event.id, update, now)
        shift = (self._local_date(timing) - self._local_date(timing_of(event))).days
        if event.rrule is not None and rule is not None and shift != 0:
            # Skipped occurrences move with the series.
            for exc in self._repos.exceptions.live_for([event.id]):
                moved = date.fromisoformat(exc.occurrence_date) + timedelta(days=shift)
                self._repos.exceptions.move(exc.id, event.id, moved.isoformat(), now)
        return _live(self._repos.events.get(event.id))

    def _add_exception(self, event_id: str, day: date) -> None:
        now = utc_now_iso(self._clock)
        self._repos.exceptions.insert(
            EventException(
                id=new_id(),
                event_id=event_id,
                occurrence_date=day.isoformat(),
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
        )

    def _merged_text(self, event: Event, fields: Mapping[str, object]) -> tuple[str, str, str]:
        title, notes, location = fields.get("title"), fields.get("notes"), fields.get("location")
        return (
            title if isinstance(title, str) else event.title,
            notes if isinstance(notes, str) else event.notes,
            location if isinstance(location, str) else event.location,
        )

    def _detach(
        self,
        event: Event,
        occurrence: Timing,
        day: date,
        fields: Mapping[str, object],
        split_id: str | None,
    ) -> list[Event]:
        if fields.get("rrule") is not None:
            raise ValidationFailed(
                "A repeat rule belongs to a series; change all or following events."
            )
        timing = merge_timing(occurrence, fields)
        self._add_exception(event.id, day)
        detached = self._insert(split_id, self._merged_text(event, fields), timing, None)
        return [_live(self._repos.events.get(event.id)), detached]

    def _split(
        self,
        event: Event,
        occurrence: Timing,
        day: date,
        fields: Mapping[str, object],
        split_id: str | None,
    ) -> list[Event]:
        assert event.rrule is not None  # noqa: S101
        anchor = self._anchor(timing_of(event))
        now = utc_now_iso(self._clock)
        head_rule = recurrence.end_before(event.rrule, anchor, day, self._zone)
        self._repos.events.update(event.id, {"rrule": head_rule}, now)

        timing = merge_timing(occurrence, fields)
        if "rrule" in fields:
            tail_in = fields["rrule"]
            tail_rule = self._normalize_rule(tail_in if isinstance(tail_in, str) else None, timing)
        else:
            tail_rule = self._normalize_rule(recurrence.remaining(event.rrule, anchor, day), timing)
        tail = self._insert(split_id, self._merged_text(event, fields), timing, tail_rule)

        if tail_rule is not None:
            # Skipped occurrences from here on now belong to the new series.
            shift = (self._local_date(timing) - day).days
            for exc in self._repos.exceptions.live_for([event.id]):
                exc_day = date.fromisoformat(exc.occurrence_date)
                if exc_day >= day:
                    moved = exc_day + timedelta(days=shift)
                    self._repos.exceptions.move(exc.id, tail.id, moved.isoformat(), now)
        return [_live(self._repos.events.get(event.id)), tail]

    def delete(
        self, event_id: str, scope: Scope = "all", occurrence_date: date | None = None
    ) -> list[Event]:
        """Deletes an event, or part of a series.

        Returns:
            The series as it is now, when part of it remains; else nothing.
        """
        with transaction(self._conn):
            event = _live(self._repos.events.get(event_id))
            now = utc_now_iso(self._clock)
            if event.rrule is None or scope == "all":
                self._repos.events.set_deleted(event.id, now, now)
                return []
            self._occurrence(event, occurrence_date)
            assert occurrence_date is not None  # noqa: S101
            if scope == "this":
                self._add_exception(event.id, occurrence_date)
                return [event]
            if self._is_first(event, occurrence_date):
                self._repos.events.set_deleted(event.id, now, now)
                return []
            rule = recurrence.end_before(
                event.rrule, self._anchor(timing_of(event)), occurrence_date, self._zone
            )
            self._repos.events.update(event.id, {"rrule": rule}, now)
            return [_live(self._repos.events.get(event.id))]

    def restore(self, event_id: str) -> Event:
        """Undoes deleting a whole event or series."""
        with transaction(self._conn):
            event = self._repos.events.get(event_id)
            if event is None or event.deleted_at is None:
                raise NotFound("No deleted event with this id.")
            self._repos.events.set_deleted(event.id, None, utc_now_iso(self._clock))
            return _live(self._repos.events.get(event.id))

    def restore_occurrence(self, event_id: str, occurrence_date: date) -> Event:
        """Brings back one skipped occurrence of a series (undo of a ``this`` delete)."""
        with transaction(self._conn):
            event = _live(self._repos.events.get(event_id))
            exc = self._repos.exceptions.get_live(event.id, occurrence_date.isoformat())
            if exc is None:
                raise NotFound("That occurrence is not skipped.")
            now = utc_now_iso(self._clock)
            self._repos.exceptions.set_deleted(exc.id, now, now)
            return event
