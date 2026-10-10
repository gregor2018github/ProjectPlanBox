"""Recurrence rules (RFC 5545 RRULE): validation, normalisation and expansion.

Shared by calendar events and repeating todos. Rules are stored without
``DTSTART``; the owner's own start (an event's start, a todo's anchor date)
is the series anchor. Timed events expand in the configured zone, so a
weekly 09:00 meeting stays at 09:00 local time across DST changes. All-day
events and todos expand on floating dates.

Only the parts the UI can produce (and a few harmless extras) are accepted,
which keeps every stored rule something the frontend can describe.
"""

from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from dateutil.rrule import rrule, rrulestr

FREQUENCIES = ("DAILY", "WEEKLY", "MONTHLY", "YEARLY")
_PART_ORDER = ("FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "BYMONTH", "BYSETPOS", "WKST")
_END_PARTS = ("COUNT", "UNTIL")
_ALLOWED = frozenset(_PART_ORDER + _END_PARTS)
MAX_RULE_LENGTH = 500
MAX_COUNT = 1000
MAX_INTERVAL = 999

type Parts = dict[str, str]
"""RRULE parts by name, e.g. ``{"FREQ": "WEEKLY", "BYDAY": "MO,WE"}``."""


class RecurrenceError(ValueError):
    """The rule is malformed or uses something PlanBox does not support."""


@dataclass(frozen=True, slots=True)
class Anchor:
    """Where a series starts and how long each occurrence lasts.

    Attributes:
        start: Local start: an aware datetime (timed) or a naive midnight (all-day).
        duration: Length of one occurrence (all-day: whole days).
        all_day: Whether occurrences are floating dates.
    """

    start: datetime
    duration: timedelta
    all_day: bool


@dataclass(frozen=True, slots=True)
class Span:
    """One occurrence: its local start date (the key) and its bounds.

    For timed events ``start``/``end`` are aware UTC datetimes; for all-day
    events they are naive midnights and ``end`` is exclusive.
    """

    occurrence_date: date
    start: datetime
    end: datetime


def timed_anchor(start_utc: datetime, end_utc: datetime, zone: ZoneInfo) -> Anchor:
    """The anchor of a timed event: its start in ``zone`` and its duration."""
    return Anchor(start_utc.astimezone(zone), end_utc - start_utc, all_day=False)


def all_day_anchor(start: date, end_inclusive: date) -> Anchor:
    """The anchor of an all-day event (``end_inclusive`` is the last day)."""
    return Anchor(
        datetime.combine(start, time()),
        timedelta(days=(end_inclusive - start).days + 1),
        all_day=True,
    )


# ------------------------------------------------------------------- parsing


def parse(rule: str) -> Parts:
    """Splits a rule into parts and checks that PlanBox supports it.

    Raises:
        RecurrenceError: If the rule is malformed or unsupported.
    """
    text = rule.strip().upper()
    text = text.removeprefix("RRULE:")
    if not text:
        raise RecurrenceError("The repeat rule is empty.")
    if len(text) > MAX_RULE_LENGTH or any(c in text for c in "\r\n"):
        raise RecurrenceError("The repeat rule is too long or spans lines.")
    parts: Parts = {}
    for chunk in text.split(";"):
        if not chunk:
            continue
        key, sep, value = chunk.partition("=")
        if not sep or not value:
            raise RecurrenceError(f"Cannot read {chunk!r} in the repeat rule.")
        if key not in _ALLOWED:
            raise RecurrenceError(f"Repeat rules with {key} are not supported.")
        if key in parts:
            raise RecurrenceError(f"{key} appears twice in the repeat rule.")
        parts[key] = value
    if parts.get("FREQ") not in FREQUENCIES:
        raise RecurrenceError("Repeat daily, weekly, monthly or yearly.")
    if "COUNT" in parts and "UNTIL" in parts:
        raise RecurrenceError("A repeat rule ends either after a count or on a date, not both.")
    _check_int(parts, "INTERVAL", 1, MAX_INTERVAL)
    _check_int(parts, "COUNT", 1, MAX_COUNT)
    return parts


def _check_int(parts: Mapping[str, str], key: str, low: int, high: int) -> None:
    if key not in parts:
        return
    value = parts[key]
    if not value.isdigit() or not low <= int(value) <= high:
        raise RecurrenceError(f"{key} must be a whole number from {low} to {high}.")


def format_rule(parts: Mapping[str, str]) -> str:
    """Joins parts in a canonical order (so equal rules compare equal)."""
    keys = [k for k in _PART_ORDER + _END_PARTS if k in parts]
    return ";".join(f"{k}={parts[k]}" for k in keys)


def normalize(rule: str, anchor: Anchor, zone: ZoneInfo) -> str:
    """Validates a rule against its anchor and returns its canonical text.

    ``UNTIL`` is rewritten to the form RFC 5545 requires for the anchor: a
    date for all-day events, a UTC instant for timed ones. A plain date on a
    timed event means "until the end of that local day".

    Raises:
        RecurrenceError: If the rule is invalid or yields no occurrence.
    """
    parts = parse(rule)
    if "UNTIL" in parts:
        parts["UNTIL"] = _normalize_until(parts["UNTIL"], anchor, zone)
    text = format_rule(parts)
    if next(iter(_build(text, anchor)), None) is None:
        raise RecurrenceError("This repeat rule never produces an occurrence.")
    return text


def _normalize_until(value: str, anchor: Anchor, zone: ZoneInfo) -> str:
    try:
        if len(value) == 8:  # noqa: PLR2004 - YYYYMMDD
            day = datetime.strptime(value, "%Y%m%d").date()  # noqa: DTZ007 - a floating date
            if anchor.all_day:
                return value
            local_end = datetime.combine(day, time(23, 59, 59), tzinfo=zone)
            return _until_utc(local_end)
        if value.endswith("Z"):
            instant = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=UTC)
        else:
            naive = datetime.strptime(value, "%Y%m%dT%H%M%S")  # noqa: DTZ007 - local per RFC 5545
            instant = naive.replace(tzinfo=zone)
    except ValueError as exc:
        raise RecurrenceError("UNTIL must be a date (YYYYMMDD) or a time.") from exc
    if anchor.all_day:
        return f"{instant.astimezone(zone):%Y%m%d}"
    return _until_utc(instant)


def _until_utc(instant: datetime) -> str:
    return f"{instant.astimezone(UTC):%Y%m%dT%H%M%SZ}"


def _build(rule: str, anchor: Anchor) -> rrule:
    try:
        built = rrulestr(rule, dtstart=anchor.start)
    except (ValueError, TypeError) as exc:
        raise RecurrenceError(f"Cannot use this repeat rule: {exc}") from exc
    if not isinstance(built, rrule):  # pragma: no cover - only RRULE parts are accepted
        raise RecurrenceError("Only a single RRULE is supported.")
    return built


# ----------------------------------------------------------------- expansion


def _span(anchor: Anchor, start: datetime) -> Span:
    if anchor.all_day:
        return Span(start.date(), start, start + anchor.duration)
    start_utc = start.astimezone(UTC)
    return Span(start.date(), start_utc, start_utc + anchor.duration)


def iterate(rule: str, anchor: Anchor) -> Iterator[Span]:
    """Every occurrence from the anchor on (unbounded rules never stop)."""
    for start in _build(rule, anchor):
        yield _span(anchor, start)


def between(
    rule: str,
    anchor: Anchor,
    range_start: datetime,
    range_end: datetime,
    skip: frozenset[date] = frozenset(),
) -> list[Span]:
    """Occurrences overlapping ``[range_start, range_end)``.

    Args:
        rule: A normalised rule.
        anchor: The series anchor.
        range_start: Aware (timed) or naive midnight (all-day), like the anchor.
        range_end: Exclusive end, same kind.
        skip: Occurrence dates removed by exceptions.

    Returns:
        The occurrences in start order.
    """
    built = _build(rule, anchor)
    # An occurrence that started before the range can still reach into it.
    starts = built.between(range_start - anchor.duration, range_end, inc=True)
    spans = [_span(anchor, s) for s in starts]
    return [
        s
        for s in spans
        if s.occurrence_date not in skip and s.start < range_end and range_start < s.end
    ]


def occurrence_on(rule: str, anchor: Anchor, day: date, zone: ZoneInfo) -> Span | None:
    """The occurrence whose local start date is ``day``, if the series has one."""
    if anchor.all_day:
        start = datetime.combine(day, time())
        end = start + timedelta(days=1)
    else:
        start = datetime.combine(day, time(), tzinfo=zone)
        end = datetime.combine(day + timedelta(days=1), time(), tzinfo=zone)
    for found in _build(rule, anchor).between(start, end, inc=True):
        span = _span(anchor, found)
        if span.occurrence_date == day:
            return span
    return None


def date_after(rule: str, start: date, day: date) -> date | None:
    """The first date of a floating-date series (anchored on ``start``) after ``day``.

    Returns:
        That date, or None when the series has ended by then.
    """
    anchor = all_day_anchor(start, start)
    found = _build(rule, anchor).after(datetime.combine(day, time()), inc=False)
    return None if found is None else found.date()


def count_before(rule: str, anchor: Anchor, day: date) -> int:
    """How many occurrences start on a local date before ``day``."""
    count = 0
    for span in iterate(rule, anchor):
        if span.occurrence_date >= day:
            break
        count += 1
    return count


def end_before(rule: str, anchor: Anchor, day: date, zone: ZoneInfo) -> str:
    """The rule cut so that its last occurrence starts before ``day``.

    ``COUNT`` is replaced by an ``UNTIL`` just before ``day``'s occurrence.
    """
    parts = parse(rule)
    parts.pop("COUNT", None)
    if anchor.all_day:
        parts["UNTIL"] = f"{day - timedelta(days=1):%Y%m%d}"
    else:
        cut = datetime.combine(day, time(), tzinfo=zone) - timedelta(seconds=1)
        parts["UNTIL"] = _until_utc(cut)
    return format_rule(parts)


def remaining(rule: str, anchor: Anchor, day: date) -> str:
    """The rule for a series continuing from ``day``: ``COUNT`` minus what already happened."""
    parts = parse(rule)
    if "COUNT" in parts:
        left = int(parts["COUNT"]) - count_before(rule, anchor, day)
        parts["COUNT"] = str(max(left, 1))
    return format_rule(parts)
