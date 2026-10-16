r"""Recurrence test vectors from the reference implementation (dateutil).

``shared/recurrence-vectors.json`` holds what ``planbox.core.recurrence``
answers for many rules and anchors. The device backend's twin
(``frontend/src/core/device/recurrence.ts``) is tested against the same
file, so both expand every rule to the same dates.

Regenerate after changing recurrence.py:
    .venv\Scripts\python.exe backend\tests\recurrence_vectors.py
"""

import json
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
VECTORS = ROOT / "shared" / "recurrence-vectors.json"
sys.path.insert(0, str(ROOT / "backend"))

from planbox.core import recurrence  # noqa: E402
from planbox.core.clock import to_iso  # noqa: E402

ZONE = "Europe/Amsterdam"
AMS = ZoneInfo(ZONE)

RULES = [
    "FREQ=DAILY",
    "FREQ=DAILY;INTERVAL=3",
    "FREQ=DAILY;COUNT=5",
    "FREQ=DAILY;UNTIL=20261102",
    "FREQ=DAILY;UNTIL=20261030T120000Z",
    "FREQ=DAILY;BYDAY=MO,WE,FR",
    "FREQ=DAILY;BYMONTHDAY=1,15,-1",
    "FREQ=WEEKLY",
    "FREQ=WEEKLY;INTERVAL=2",
    "FREQ=WEEKLY;BYDAY=MO,TH",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU",
    "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,SU;WKST=SU",
    "FREQ=WEEKLY;BYDAY=SA;COUNT=4",
    "FREQ=WEEKLY;BYDAY=1MO",
    "FREQ=MONTHLY",
    "FREQ=MONTHLY;INTERVAL=2",
    "FREQ=MONTHLY;BYMONTHDAY=31",
    "FREQ=MONTHLY;BYMONTHDAY=-1",
    "FREQ=MONTHLY;BYMONTHDAY=1,15",
    "FREQ=MONTHLY;BYDAY=2TU",
    "FREQ=MONTHLY;BYDAY=-1FR",
    "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
    "FREQ=MONTHLY;BYDAY=SA,SU;BYSETPOS=1,2",
    "FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13",
    "FREQ=MONTHLY;COUNT=6;BYMONTHDAY=30",
    "FREQ=MONTHLY;BYMONTH=1,7",
    "FREQ=YEARLY",
    "FREQ=YEARLY;INTERVAL=2",
    "FREQ=YEARLY;BYMONTH=3,10;BYDAY=-1SU",
    "FREQ=YEARLY;BYDAY=20MO",
    "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29",
    "FREQ=YEARLY;BYMONTH=6",
    "FREQ=YEARLY;BYMONTHDAY=1;BYMONTH=1,4,7,10",
    "FREQ=YEARLY;UNTIL=20300101",
]

BAD_RULES = [
    "",
    "FREQ=HOURLY",
    "FREQ=DAILY;BYHOUR=9",
    "FREQ=DAILY;COUNT=0",
    "FREQ=DAILY;INTERVAL=1000",
    "FREQ=DAILY;COUNT=2;UNTIL=20261231",
    "FREQ=WEEKLY;BYDAY=XX",
    "FREQ=MONTHLY;BYSETPOS=0;BYDAY=MO",
    "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30",
    "FREQ=DAILY;UNTIL=20200101",
    "FREQ=DAILY;UNTIL=2026",
]

TIMED = [
    # Across the October DST change, at 09:30 local.
    ("2026-10-20T07:30:00Z", "2026-10-20T08:15:00Z"),
    # On a 31st, late evening (local date differs from the UTC date).
    ("2026-08-31T21:30:00Z", "2026-08-31T23:00:00Z"),
    # Inside the hour that does not exist on 2027-03-28 (repeats hit the gap).
    ("2027-03-27T01:30:00Z", "2027-03-27T02:00:00Z"),
]
ALL_DAY = [
    (date(2026, 10, 14), date(2026, 10, 14)),
    (date(2026, 1, 31), date(2026, 2, 1)),
    (date(2028, 2, 29), date(2028, 2, 29)),
]
LIMIT = 15


def _iso_span(span: recurrence.Span, all_day: bool) -> list[str]:
    if all_day:
        return [
            span.occurrence_date.isoformat(),
            span.start.isoformat(),
            span.end.isoformat(),
        ]
    return [span.occurrence_date.isoformat(), to_iso(span.start), to_iso(span.end)]


def _case(rule: str, anchor: recurrence.Anchor, label: dict[str, object]) -> dict[str, object]:
    case: dict[str, object] = {"rule": rule, **label}
    try:
        text = recurrence.normalize(rule, anchor, AMS)
    except recurrence.RecurrenceError:
        case["error"] = True
        return case
    case["normalized"] = text
    spans = []
    for i, span in enumerate(recurrence.iterate(text, anchor)):
        if i >= LIMIT:
            break
        spans.append(_iso_span(span, anchor.all_day))
    case["first"] = spans
    first_day = anchor.start.date() + timedelta(days=20)
    last_day = first_day + timedelta(days=30)
    if anchor.all_day:
        lo = datetime.combine(first_day, datetime.min.time())
        hi = datetime.combine(last_day, datetime.min.time())
    else:
        lo = datetime.combine(first_day, datetime.min.time(), tzinfo=AMS).astimezone(UTC)
        hi = datetime.combine(last_day, datetime.min.time(), tzinfo=AMS).astimezone(UTC)
    skip = frozenset({first_day + timedelta(days=7)})
    case["between"] = {
        "start": first_day.isoformat(),
        "end": last_day.isoformat(),
        "skip": [d.isoformat() for d in skip],
        "spans": [
            _iso_span(s, anchor.all_day) for s in recurrence.between(text, anchor, lo, hi, skip)
        ],
    }
    probes = [anchor.start.date() + timedelta(days=n) for n in (0, 1, 7, 30, 31, 365)]
    case["on"] = {
        d.isoformat(): (
            None
            if (s := recurrence.occurrence_on(text, anchor, d, AMS)) is None
            else _iso_span(s, anchor.all_day)
        )
        for d in probes
    }
    cut = probes[3]
    case["count_before"] = recurrence.count_before(text, anchor, cut)
    case["end_before"] = recurrence.end_before(text, anchor, cut, AMS)
    case["remaining"] = recurrence.remaining(text, anchor, cut)
    return case


def _floating(rule: str, start: date) -> dict[str, object]:
    case: dict[str, object] = {"rule": rule, "start": start.isoformat()}
    anchor = recurrence.all_day_anchor(start, start)
    try:
        text = recurrence.normalize(rule, anchor, AMS)
    except recurrence.RecurrenceError:
        case["error"] = True
        return case
    case["normalized"] = text
    days = [start + timedelta(days=n) for n in (-1, 0, 3, 40, 400)]
    case["date_after"] = {
        d.isoformat(): (
            None if (a := recurrence.date_after(text, start, d)) is None else a.isoformat()
        )
        for d in days
    }
    first, last = start + timedelta(days=10), start + timedelta(days=120)
    case["series"] = {
        "after": (start + timedelta(days=15)).isoformat(),
        "first": first.isoformat(),
        "last": last.isoformat(),
        "dates": [
            d.isoformat()
            for d in recurrence.series_dates(
                text, start, start + timedelta(days=15), first, last, limit=25
            )
        ],
    }
    case["plain"] = recurrence.is_plain(text)
    if case["plain"]:
        case["step"] = recurrence.step(text, start).isoformat()
        stepped = recurrence.step_after(text, start)
        case["step_after"] = None if stepped is None else [stepped[0].isoformat(), stepped[1]]
        case["stepped"] = [
            d.isoformat() for d in recurrence.stepped_dates(text, start, first, last, limit=25)
        ]
        until = recurrence.floating_until(text)
        case["floating_until"] = None if until is None else until.isoformat()
    return case


def build() -> dict[str, object]:
    """Every vector, deterministically."""
    timed = [
        _case(
            rule,
            recurrence.timed_anchor(
                datetime.fromisoformat(times[0]), datetime.fromisoformat(times[1]), AMS
            ),
            {
                "start_at": times[0],
                "end_at": times[1],
            },
        )
        for i, times in enumerate(TIMED)
        for rule in RULES + (BAD_RULES if i == 0 else [])
    ]
    all_day = [
        _case(
            rule,
            recurrence.all_day_anchor(*days),
            {
                "start_date": days[0].isoformat(),
                "end_date": days[1].isoformat(),
            },
        )
        for i, days in enumerate(ALL_DAY)
        for rule in RULES + (BAD_RULES if i == 0 else [])
    ]
    floating = [_floating(rule, days[0]) for days in ALL_DAY for rule in RULES]
    return {"zone": ZONE, "timed": timed, "all_day": all_day, "floating": floating}


def render() -> str:
    """The vectors as the committed JSON text."""
    return json.dumps(build(), indent=1, sort_keys=True) + "\n"


if __name__ == "__main__":
    VECTORS.write_text(render(), encoding="utf-8", newline="\n")
    print(f"wrote {VECTORS}")
