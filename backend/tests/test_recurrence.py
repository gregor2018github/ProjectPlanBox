"""Recurrence rules: validation, normalisation and expansion across DST."""

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

import pytest

from planbox.core import recurrence
from planbox.core.recurrence import RecurrenceError

AMS = ZoneInfo("Europe/Amsterdam")


def _timed(start: str, end: str) -> recurrence.Anchor:
    return recurrence.timed_anchor(datetime.fromisoformat(start), datetime.fromisoformat(end), AMS)


@pytest.mark.parametrize(
    "rule",
    [
        "",
        "INTERVAL=2",
        "FREQ=HOURLY",
        "FREQ=WEEKLY;BYHOUR=9",
        "FREQ=DAILY;COUNT=2;UNTIL=20261231",
        "FREQ=DAILY;INTERVAL=0",
        "FREQ=DAILY;COUNT=5000",
        "FREQ=DAILY;FREQ=WEEKLY",
        "FREQ=DAILY\nBYDAY=MO",
    ],
)
def test_parse_rejects_unsupported_rules(rule: str) -> None:
    """Only the parts the UI can produce are accepted."""
    with pytest.raises(RecurrenceError):
        recurrence.parse(rule)


def test_normalize_orders_parts_and_strips_prefix() -> None:
    """Equal rules get equal text."""
    anchor = _timed("2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z")
    assert (
        recurrence.normalize("rrule:byday=MO,WE;freq=weekly;interval=2", anchor, AMS)
        == "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE"
    )


def test_until_date_on_timed_event_means_end_of_that_local_day() -> None:
    """A plain UNTIL date becomes 23:59:59 local, in UTC, as RFC 5545 requires."""
    anchor = _timed("2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z")
    rule = recurrence.normalize("FREQ=DAILY;UNTIL=20261007", anchor, AMS)
    assert rule == "FREQ=DAILY;UNTIL=20261007T215959Z"
    days = [s.occurrence_date for s in recurrence.iterate(rule, anchor)]
    assert days == [date(2026, 10, 5), date(2026, 10, 6), date(2026, 10, 7)]


def test_until_instant_on_all_day_event_becomes_a_date() -> None:
    """All-day series end on a date."""
    anchor = recurrence.all_day_anchor(date(2026, 10, 5), date(2026, 10, 5))
    assert (
        recurrence.normalize("FREQ=DAILY;UNTIL=20261007T120000Z", anchor, AMS)
        == "FREQ=DAILY;UNTIL=20261007"
    )


def test_rule_without_occurrences_is_rejected() -> None:
    """A rule that ends before its anchor would create an invisible event."""
    anchor = recurrence.all_day_anchor(date(2026, 10, 5), date(2026, 10, 5))
    with pytest.raises(RecurrenceError):
        recurrence.normalize("FREQ=DAILY;UNTIL=20261001", anchor, AMS)


def test_weekly_event_keeps_local_time_across_dst() -> None:
    """09:00 in Amsterdam is 07:00Z in summer time and 08:00Z after 25 October."""
    anchor = _timed("2026-10-19T07:00:00Z", "2026-10-19T08:00:00Z")
    spans = recurrence.between(
        "FREQ=WEEKLY",
        anchor,
        datetime(2026, 10, 19, tzinfo=UTC),
        datetime(2026, 11, 3, tzinfo=UTC),
    )
    assert [s.start.isoformat() for s in spans] == [
        "2026-10-19T07:00:00+00:00",
        "2026-10-26T08:00:00+00:00",
        "2026-11-02T08:00:00+00:00",
    ]


def test_between_includes_occurrences_that_started_earlier_and_skips_exceptions() -> None:
    """A three-day all-day occurrence reaches into the range; skipped dates disappear."""
    anchor = recurrence.all_day_anchor(date(2026, 10, 1), date(2026, 10, 3))
    lo = datetime.combine(date(2026, 10, 3), time())
    hi = datetime.combine(date(2026, 10, 10), time())
    spans = recurrence.between("FREQ=DAILY;INTERVAL=2", anchor, lo, hi)
    assert [s.occurrence_date.day for s in spans] == [1, 3, 5, 7, 9]
    skipped = recurrence.between(
        "FREQ=DAILY;INTERVAL=2", anchor, lo, hi, frozenset({date(2026, 10, 5)})
    )
    assert [s.occurrence_date.day for s in skipped] == [1, 3, 7, 9]


def test_occurrence_on_finds_only_real_occurrences() -> None:
    """Mondays and Wednesdays only."""
    anchor = _timed("2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z")
    rule = "FREQ=WEEKLY;BYDAY=MO,WE"
    found = recurrence.occurrence_on(rule, anchor, date(2026, 10, 7), AMS)
    assert found is not None
    assert found.start == datetime(2026, 10, 7, 7, tzinfo=UTC)
    assert recurrence.occurrence_on(rule, anchor, date(2026, 10, 6), AMS) is None


def test_split_with_count_keeps_the_total() -> None:
    """Five occurrences split at the third: the head keeps two, the tail three."""
    anchor = recurrence.all_day_anchor(date(2026, 10, 1), date(2026, 10, 1))
    rule = "FREQ=DAILY;COUNT=5"
    head = recurrence.end_before(rule, anchor, date(2026, 10, 3), AMS)
    tail = recurrence.remaining(rule, anchor, date(2026, 10, 3))
    assert head == "FREQ=DAILY;UNTIL=20261002"
    assert tail == "FREQ=DAILY;COUNT=3"
    assert [s.occurrence_date.day for s in recurrence.iterate(head, anchor)] == [1, 2]


def test_split_of_timed_series_ends_just_before_that_local_day() -> None:
    """The head's UNTIL is one second before local midnight of the split day."""
    anchor = _timed("2026-10-05T07:00:00Z", "2026-10-05T08:00:00Z")
    head = recurrence.end_before("FREQ=DAILY", anchor, date(2026, 10, 8), AMS)
    assert head == "FREQ=DAILY;UNTIL=20261007T215959Z"
