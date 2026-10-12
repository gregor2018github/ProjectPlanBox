"""Insights use cases: record app opens and summarise activity across modules.

The core never reads module tables. Each entity type may offer an
``activity`` source (see ``EntityType``); this service buckets those events
by local day in the configured zone.
"""

import sqlite3
from collections import Counter
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from planbox.core.clock import Clock, to_iso, utc_now_iso
from planbox.core.db import transaction
from planbox.core.entities import ActivityWindow, EntityRegistry
from planbox.core.errors import ValidationFailed
from planbox.core.ids import is_valid_id, new_id
from planbox.core.insights.models import (
    Activity,
    AppOpen,
    DayActivity,
    OpenStats,
    TypeActivity,
)
from planbox.core.insights.repository import AppOpenRepository

MAX_RANGE_DAYS = 400
"""Longest range one activity request may cover (a year view needs 371 days)."""

_ACTIONS = ("created", "completed", "deleted")


def local_start(day: date, zone: ZoneInfo) -> str:
    """The UTC instant at which ``day`` starts in ``zone``."""
    return to_iso(datetime.combine(day, time(), tzinfo=zone))


def local_moment(instant: str, zone: ZoneInfo) -> datetime:
    """A stored UTC instant as an aware datetime in ``zone``."""
    return datetime.fromisoformat(instant).astimezone(zone)


class InsightsService:
    """Answers the Insights page's cross-module questions."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        repository: AppOpenRepository,
        registry: EntityRegistry,
        clock: Clock,
        zone: ZoneInfo,
    ) -> None:
        self._conn = conn
        self._repo = repository
        self._registry = registry
        self._clock = clock
        self._zone = zone

    def record_open(self, open_id: str | None) -> tuple[AppOpen, bool]:
        """Records that the app was opened.

        Args:
            open_id: Client-generated UUIDv7, so a retried request counts once.

        Returns:
            The row and whether this call created it.

        Raises:
            ValidationFailed: If the id is not a UUIDv7.
        """
        if open_id is not None and not is_valid_id(open_id):
            raise ValidationFailed("id must be a lowercase UUIDv7")
        with transaction(self._conn):
            if open_id is not None and (existing := self._repo.get(open_id)) is not None:
                return existing, False
            now = utc_now_iso(self._clock)
            row = AppOpen(id=open_id or new_id(), created_at=now, updated_at=now, deleted_at=None)
            self._repo.insert(row)
            return row, True

    def activity(self, start: date, end: date) -> Activity:
        """What was created, completed and deleted per local day, plus app opens.

        Raises:
            ValidationFailed: If the range is reversed or longer than ``MAX_RANGE_DAYS``.
        """
        if end < start:
            raise ValidationFailed("end must not be before start")
        if (end - start).days + 1 > MAX_RANGE_DAYS:
            raise ValidationFailed(f"a range covers at most {MAX_RANGE_DAYS} days")
        since = local_start(start, self._zone)
        until = local_start(end + timedelta(days=1), self._zone)

        window = ActivityWindow(since, utc_now_iso(self._clock), self._zone)
        per_day: dict[date, Counter[str]] = {}
        types: list[TypeActivity] = []
        for entity_type in self._registry.all_types():
            if entity_type.activity is None:
                continue
            totals: Counter[str] = Counter()
            for event in entity_type.activity(self._conn, window):
                if event.at < since or event.at >= until:
                    continue
                day = local_moment(event.at, self._zone).date()
                per_day.setdefault(day, Counter())[event.action] += 1
                totals[event.action] += 1
            types.append(TypeActivity(entity_type.name, *(totals[a] for a in _ACTIONS)))

        by_hour = [0] * 24
        by_weekday = [0] * 7
        opens = self._repo.instants_between(since, until)
        for instant in opens:
            moment = local_moment(instant, self._zone)
            per_day.setdefault(moment.date(), Counter())["opens"] += 1
            by_hour[moment.hour] += 1
            by_weekday[moment.weekday()] += 1
        all_time, first_at = self._repo.totals()

        days = [
            DayActivity(day, *(counts[a] for a in _ACTIONS), opens=counts["opens"])
            for day, counts in sorted(per_day.items())
        ]
        return Activity(
            start=start,
            end=end,
            days=days,
            types=types,
            opens=OpenStats(len(opens), all_time, first_at, by_hour, by_weekday),
        )
