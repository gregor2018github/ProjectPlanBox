r"""API scenarios recorded from the Python backend, replayed by the device backend.

The phone app runs a TypeScript twin of this backend. To keep the two from
drifting apart, ``shared/api-scenarios.json`` holds request sequences and
the answers this server gives. ``test_api_scenarios.py`` checks the file is
current; ``frontend/src/modules/scenarios.test.ts`` replays every request on
the device backend and expects the same answers.

Ids the server makes itself (a repeating todo's next occurrence) differ
between runs, so answers are normalised: every UUID that no request named
becomes ``#1``, ``#2``, ... in order of appearance. Later requests can name
such an id as ``{#1}``. Errors compare by status and code only.

Regenerate after changing behaviour:
    .venv\Scripts\python.exe backend\tests\api_scenarios.py
"""

import json
import re
import sys
import tempfile
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS_FILE = ROOT / "shared" / "api-scenarios.json"
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from planbox.config import Settings  # noqa: E402
from planbox.core.clock import FixedClock  # noqa: E402
from planbox.main import create_app  # noqa: E402

START = datetime(2026, 10, 8, 12, 0, 0, tzinfo=UTC)
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
PLACEHOLDER = re.compile(r"\{#(\d+)\}")


def cid(n: int) -> str:
    """A fixed client id (UUIDv7 from 2025, older than anything the server makes)."""
    return f"01990000-0000-7000-8000-{n:012d}"


type Step = dict[str, Any]


def req(method: str, path: str, body: Any = None, *, advance: int = 0) -> Step:  # noqa: ANN401
    """One request; ``advance`` moves the clock forward (seconds) first."""
    step: Step = {"method": method, "path": path}
    if body is not None:
        step["body"] = body
    if advance:
        step["advance"] = advance
    return step


# ------------------------------------------------------------------ scenarios


def todos_basics() -> list[Step]:
    """Areas, lists, sections, todos, subtasks, moves, deletes and restores."""
    area, inbox_todo, lst, other, section = cid(1), cid(2), cid(3), cid(4), cid(5)
    t1, t2, sub1, sub2 = cid(10), cid(11), cid(12), cid(13)
    return [
        req("POST", "/api/todos/areas", {"id": area, "name": "Work"}),
        req("POST", "/api/todos/areas", {"id": cid(6), "name": "Home", "hue": 30}),
        req("PATCH", f"/api/todos/areas/{area}", {"hue": 200}),
        req("POST", f"/api/todos/areas/{cid(6)}/move", {"before_id": area}),
        req("GET", "/api/todos/areas"),
        req("POST", "/api/todos/lists", {"id": lst, "name": "Project", "area_id": area}),
        req("POST", "/api/todos/lists", {"id": other, "name": "Errands"}),
        req("POST", "/api/todos/lists", {"name": "Bad", "area_id": cid(99)}),
        req("PATCH", f"/api/todos/lists/{other}", {"name": "  Errands \n  run "}),
        req("POST", f"/api/todos/lists/{other}/move", {"area_id": area, "after_id": lst}),
        req("POST", "/api/todos/sections", {"id": section, "list_id": lst, "name": "Next"}),
        req("POST", "/api/todos/items", {"id": inbox_todo, "title": "Inbox thing"}),
        req(
            "POST",
            "/api/todos/items",
            {
                "id": t1,
                "title": "Write report",
                "notes": "line 1\nline 2",
                "priority": 3,
                "due_date": "2026-10-10",
                "list_id": lst,
                "section_id": section,
            },
        ),
        req(
            "POST",
            "/api/todos/items",
            {"id": t2, "title": "Review", "list_id": lst, "section_id": section, "before_id": t1},
        ),
        req("POST", "/api/todos/items", {"title": "Wrong", "list_id": lst, "before_id": t1}),
        req(
            "POST",
            "/api/todos/items",
            {
                "id": sub1,
                "title": "Outline",
                "list_id": lst,
                "section_id": section,
                "parent_id": t1,
            },
        ),
        req(
            "POST",
            "/api/todos/items",
            {"id": sub2, "title": "Draft", "list_id": lst, "section_id": section, "parent_id": t1},
        ),
        req("POST", "/api/todos/items", {"title": "Deep", "list_id": lst, "parent_id": sub1}),
        req("PATCH", f"/api/todos/items/{t2}", {"title": "Review it", "due_date": "2026-10-09"}),
        req("PATCH", f"/api/todos/items/{t2}", {"priority": None}),
        req("POST", f"/api/todos/items/{sub1}/complete", advance=60),
        req("POST", f"/api/todos/items/{t1}/complete", advance=60),
        req("POST", f"/api/todos/items/{sub2}/reopen", advance=60),
        req(
            "POST",
            f"/api/todos/items/{t1}/move",
            {"list_id": other, "section_id": None, "parent_id": None},
        ),
        req("GET", "/api/todos/items?completed_since=2026-10-01T00:00:00Z"),
        req("GET", "/api/todos/items?completed_since=2026-10-01T00:00:00"),
        req("DELETE", f"/api/todos/sections/{section}", advance=60),
        req("DELETE", f"/api/todos/areas/{area}", advance=60),
        req("GET", "/api/todos/lists"),
        req("POST", f"/api/todos/lists/{lst}/restore"),
        req("POST", f"/api/todos/areas/{area}/restore", advance=60),
        req("GET", "/api/todos/lists"),
        req("GET", "/api/todos/sections"),
        req("POST", f"/api/todos/sections/{section}/restore"),
        req("DELETE", f"/api/todos/items/{t1}", advance=60),
        req("POST", f"/api/todos/items/{t1}/restore"),
        req("GET", "/api/todos/items?completed_since=2026-10-01T00:00:00Z"),
        req("POST", f"/api/todos/sections/{section}/move", {"list_id": other}),
        req("GET", f"/api/todos/items/{sub2}"),
        req("GET", "/api/todos/items/completed?limit=1"),
        req("GET", "/api/todos/items/completed?cursor=bad"),
        req("GET", "/api/todos/stats", advance=86_400 * 3),
    ]


def todos_repeating() -> list[Step]:
    """Repeating todos: schedule and completion modes, skip, forecast, rank orders."""
    weekly, monthly, plain, sub = cid(20), cid(21), cid(22), cid(23)
    return [
        req("POST", "/api/tags", {"id": cid(30), "name": "home"}),
        req(
            "POST",
            "/api/todos/items",
            {
                "id": weekly,
                "title": "Water plants",
                "due_date": "2026-10-06",
                "rrule": "FREQ=WEEKLY;BYDAY=TU,FR",
                "tag_ids": [cid(30)],
            },
        ),
        req(
            "POST",
            "/api/todos/items",
            {"id": sub, "title": "Fill can", "parent_id": weekly, "due_date": "2026-10-06"},
        ),
        req(
            "POST",
            "/api/todos/items",
            {"id": monthly, "title": "Rent", "rrule": "FREQ=MONTHLY;BYMONTHDAY=-1"},
        ),
        req(
            "POST",
            "/api/todos/items",
            {
                "id": plain,
                "title": "Haircut",
                "due_date": "2026-10-01",
                "rrule": "FREQ=WEEKLY;INTERVAL=5;COUNT=3",
                "repeat_from": "completion",
            },
        ),
        req(
            "POST",
            "/api/todos/items",
            {"title": "Bad", "rrule": "FREQ=WEEKLY;BYDAY=MO", "repeat_from": "completion"},
        ),
        req("POST", "/api/todos/items", {"title": "Bad", "rrule": "FREQ=HOURLY"}),
        req("GET", "/api/todos/forecast?start=2026-10-01&end=2026-11-30"),
        req("POST", f"/api/todos/items/{weekly}/complete", advance=3600),
        req("POST", f"/api/todos/items/{weekly}/reopen", advance=60),
        req("POST", f"/api/todos/items/{weekly}/complete", advance=60),
        req("POST", "/api/todos/items/{#3}/skip", advance=60),
        req("POST", f"/api/todos/items/{plain}/complete", advance=86_400 * 2),
        req("POST", "/api/todos/items/{#5}/skip"),
        req("POST", f"/api/todos/items/{monthly}/skip"),
        req("PATCH", f"/api/todos/items/{monthly}", {"repeat_from": "completion"}),
        req("PATCH", f"/api/todos/items/{monthly}", {"rrule": "FREQ=MONTHLY;INTERVAL=2"}),
        req("PATCH", f"/api/todos/items/{monthly}", {"repeat_from": "completion"}),
        req("PATCH", f"/api/todos/items/{monthly}", {"due_date": "2026-12-01"}),
        req("PATCH", f"/api/todos/items/{monthly}", {"due_date": None}),
        req("PATCH", f"/api/todos/items/{monthly}", {"rrule": "FREQ=DAILY;COUNT=2"}),
        req("POST", "/api/todos/today-order", {"ids": [monthly, "{#3}"]}),
        req("POST", "/api/todos/today-order", {"ids": [monthly, monthly]}),
        req("POST", "/api/todos/rank-order", {"ids": [plain, monthly], "unranked": ["{#3}"]}),
        req("POST", "/api/todos/rank-order", {"ids": [monthly], "scope": "today"}),
        req("PATCH", f"/api/todos/items/{monthly}", {"due_date": "2027-01-01"}),
        req("GET", "/api/todos/items?completed_since=2026-01-01T00:00:00Z"),
        req("GET", "/api/todos/forecast?start=2026-10-01&end=2027-12-30"),
        req("GET", "/api/todos/stats"),
    ]


def tags_links_search() -> list[Step]:
    """Tags, links between modules, full-text search and insights."""
    todo, note = cid(40), cid(41)
    return [
        req("POST", "/api/tags", {"id": cid(42), "name": "urgent"}),
        req("POST", "/api/tags", {"id": cid(42), "name": "urgent"}),
        req("POST", "/api/tags", {"name": "URGENT"}),
        req("POST", "/api/tags", {"name": "two words"}),
        req("POST", "/api/tags", {"id": cid(43), "name": "Später"}),
        req("GET", "/api/tags"),
        req(
            "POST",
            "/api/todos/items",
            {
                "id": todo,
                "title": "Call the café",
                "notes": "about the order",
                "tag_ids": [cid(42)],
            },
        ),
        req(
            "POST",
            "/api/knowledge/entries",
            {
                "id": note,
                "kind": "note",
                "title": "Café notes",
                "body": "Open Mondays",
                "tag_ids": [cid(43), cid(42)],
            },
        ),
        req(
            "POST",
            "/api/links",
            {"id": cid(44), "source": f"todos.todo:{todo}", "target": f"knowledge.entry:{note}"},
        ),
        req(
            "POST",
            "/api/links",
            {"source": f"knowledge.entry:{note}", "target": f"todos.todo:{todo}"},
        ),
        req("POST", "/api/links", {"source": "todos.todo:nope", "target": f"todos.todo:{todo}"}),
        req("POST", "/api/links", {"source": "nonsense", "target": f"todos.todo:{todo}"}),
        req("GET", f"/api/links?entity=todos.todo:{todo}"),
        req("GET", "/api/search?q=cafe"),
        req("GET", "/api/search?q=caf ord"),
        req("GET", "/api/search?q=%22"),
        req("PATCH", f"/api/tags/{cid(42)}", {"name": "later"}),
        req("PATCH", f"/api/tags/{cid(42)}", {"name": "später"}),
        req("DELETE", f"/api/tags/{cid(43)}", advance=60),
        req("GET", "/api/knowledge/entries"),
        req("POST", f"/api/tags/{cid(43)}/restore"),
        req("DELETE", f"/api/links/{cid(44)}"),
        req("POST", f"/api/links/{cid(44)}/restore"),
        req("DELETE", f"/api/todos/items/{todo}", advance=60),
        req("GET", "/api/search?q=caf"),
        req("GET", f"/api/links?entity=knowledge.entry:{note}"),
        req("POST", "/api/insights/opens", {"id": cid(45)}),
        req("POST", "/api/insights/opens", {"id": cid(45)}),
        req("GET", "/api/insights/activity?start=2026-10-01&end=2026-10-31", advance=86_400),
        req("GET", "/api/insights/activity?start=2026-10-31&end=2026-10-01"),
        req("PATCH", "/api/preferences", {"theme": "dark"}),
        req("GET", "/api/preferences"),
    ]


def knowledge() -> list[Step]:
    """Collections and entries of every kind."""
    col, link, snippet = cid(50), cid(51), cid(52)
    return [
        req("POST", "/api/knowledge/collections", {"id": col, "name": "Recipes"}),
        req("POST", "/api/knowledge/collections", {"id": cid(53), "name": "Work"}),
        req("POST", f"/api/knowledge/collections/{cid(53)}/move", {"before_id": col}),
        req("PATCH", f"/api/knowledge/collections/{col}", {"name": "Cooking"}),
        req(
            "POST",
            "/api/knowledge/entries",
            {
                "id": link,
                "kind": "link",
                "title": "Bread",
                "url": " https://example.com/bread ",
                "collection_id": col,
            },
        ),
        req(
            "POST",
            "/api/knowledge/entries",
            {"kind": "link", "title": "Bad", "url": "javascript:alert(1)"},
        ),
        req(
            "POST", "/api/knowledge/entries", {"kind": "note", "title": "Bad", "url": "https://x.y"}
        ),
        req(
            "POST",
            "/api/knowledge/entries",
            {
                "id": snippet,
                "kind": "snippet",
                "title": "Loop",
                "body": "for x in y:\n    pass",
                "language": " python ",
            },
        ),
        req("POST", "/api/knowledge/entries", {"kind": "note", "title": "Bad", "language": "py"}),
        req(
            "PATCH",
            f"/api/knowledge/entries/{snippet}",
            {"language": None, "collection_id": col},
            advance=60,
        ),
        req("PATCH", f"/api/knowledge/entries/{link}", {"language": "x"}),
        req("PATCH", f"/api/knowledge/entries/{link}", {"url": "https://example.org"}, advance=60),
        req("DELETE", f"/api/knowledge/collections/{col}", advance=60),
        req("POST", f"/api/knowledge/entries/{link}/restore"),
        req("POST", f"/api/knowledge/collections/{col}/restore", advance=60),
        req("GET", "/api/knowledge/collections"),
        req("GET", "/api/knowledge/entries"),
        req("DELETE", f"/api/knowledge/entries/{link}"),
        req("POST", f"/api/knowledge/entries/{link}/restore"),
    ]


def calendar() -> list[Step]:
    """Single and recurring events, scopes, exceptions, done marks, DST."""
    meeting, holiday, single, allday = cid(60), cid(61), cid(62), cid(63)
    return [
        req(
            "POST",
            "/api/calendar/events",
            {
                "id": meeting,
                "title": "Standup",
                "start_at": "2026-10-19T07:30:00Z",
                "end_at": "2026-10-19T07:45:00Z",
                "rrule": "FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231",
            },
        ),
        req(
            "POST",
            "/api/calendar/events",
            {
                "id": holiday,
                "title": "Trip",
                "all_day": True,
                "start_date": "2026-10-23",
                "end_date": "2026-10-25",
                "rrule": "FREQ=YEARLY;COUNT=3",
            },
        ),
        req(
            "POST",
            "/api/calendar/events",
            {
                "id": single,
                "title": "Dentist",
                "location": "Town",
                "start_at": "2026-10-20T09:00:00+02:00",
                "end_at": "2026-10-20T10:00:00+02:00",
            },
        ),
        req(
            "POST",
            "/api/calendar/events",
            {"title": "Naive", "start_at": "2026-10-20T09:00:00", "end_at": "2026-10-20T10:00:00"},
        ),
        req(
            "POST",
            "/api/calendar/events",
            {
                "title": "Backwards",
                "start_at": "2026-10-20T10:00:00Z",
                "end_at": "2026-10-20T09:00:00Z",
            },
        ),
        req(
            "POST",
            "/api/calendar/events",
            {
                "id": allday,
                "title": "Fair",
                "all_day": True,
                "start_date": "2026-10-26",
                "end_date": "2026-10-26",
            },
        ),
        req("GET", "/api/calendar/events?start=2026-10-19&end=2026-11-02"),
        req("GET", "/api/calendar/events?start=2026-10-19&end=2027-10-02"),
        req(
            "PATCH",
            f"/api/calendar/events/{meeting}",
            {
                "scope": "this",
                "occurrence_date": "2026-10-21",
                "start_at": "2026-10-21T08:00:00Z",
                "end_at": "2026-10-21T08:30:00Z",
                "split_id": cid(64),
            },
        ),
        req(
            "PATCH",
            f"/api/calendar/events/{meeting}",
            {"scope": "this", "occurrence_date": "2026-10-20", "title": "x"},
        ),
        req(
            "PATCH",
            f"/api/calendar/events/{meeting}",
            {
                "scope": "following",
                "occurrence_date": "2026-11-02",
                "title": "Standup v2",
                "split_id": cid(65),
            },
        ),
        req(
            "PUT",
            f"/api/calendar/events/{meeting}/done",
            {"occurrence_date": "2026-10-26", "done": True},
        ),
        req(
            "PUT",
            f"/api/calendar/events/{meeting}/done",
            {"occurrence_date": "2026-10-27", "done": True},
        ),
        req(
            "PUT",
            f"/api/calendar/events/{single}/done",
            {"occurrence_date": "2026-10-20", "done": False},
        ),
        req("DELETE", f"/api/calendar/events/{meeting}?scope=this&occurrence_date=2026-10-28"),
        req("POST", f"/api/calendar/events/{meeting}/occurrences/2026-10-28/restore"),
        req("DELETE", f"/api/calendar/events/{cid(65)}?scope=following&occurrence_date=2026-11-16"),
        req(
            "PATCH",
            f"/api/calendar/events/{meeting}",
            {
                "start_at": "2026-10-20T07:30:00Z",
                "end_at": "2026-10-20T07:45:00Z",
                "rrule": "FREQ=WEEKLY;BYDAY=TU",
            },
        ),
        req(
            "PATCH",
            f"/api/calendar/events/{holiday}",
            {
                "all_day": False,
                "start_at": "2026-10-23T10:00:00Z",
                "end_at": "2026-10-23T12:00:00Z",
            },
        ),
        req("PATCH", f"/api/calendar/events/{allday}", {"all_day": False}),
        req("GET", "/api/calendar/events?start=2026-10-19&end=2026-11-30"),
        req("DELETE", f"/api/calendar/events/{single}"),
        req("POST", f"/api/calendar/events/{single}/restore"),
        req("GET", f"/api/calendar/events/{single}"),
        req("GET", "/api/insights/activity?start=2026-10-01&end=2026-12-31", advance=86_400 * 40),
    ]


def habits() -> list[Step]:
    """Habits, check-ins, days off and streaks."""
    daily, weekly = cid(70), cid(71)
    return [
        req(
            "POST", "/api/habits/habits", {"id": daily, "name": "Read", "start_date": "2026-10-01"}
        ),
        req(
            "POST",
            "/api/habits/habits",
            {
                "id": weekly,
                "name": "Run",
                "rrule": "FREQ=WEEKLY;BYDAY=MO,TH",
                "start_date": "2026-09-28",
            },
        ),
        req("POST", "/api/habits/habits", {"name": "Bad", "rrule": "FREQ=SECONDLY"}),
        req("PUT", f"/api/habits/habits/{daily}/checkins/2026-10-06"),
        req("PUT", f"/api/habits/habits/{daily}/checkins/2026-10-07"),
        req("PUT", f"/api/habits/habits/{daily}/checkins/2026-10-08"),
        req("PUT", f"/api/habits/habits/{daily}/checkins/2026-10-09"),
        req("PUT", f"/api/habits/habits/{weekly}/checkins/2026-09-21"),
        req("PUT", f"/api/habits/habits/{weekly}/checkins/2026-10-05"),
        req("DELETE", f"/api/habits/habits/{daily}/checkins/2026-10-07"),
        req(
            "POST",
            "/api/habits/days-off",
            {
                "items": [
                    {"habit_id": daily, "day": "2026-10-07"},
                    {"habit_id": weekly, "day": "2026-10-01"},
                    {"habit_id": daily, "day": "2026-10-07"},
                ],
                "off": True,
            },
        ),
        req(
            "POST",
            "/api/habits/days-off",
            {"items": [{"habit_id": weekly, "day": "2026-10-01"}], "off": False},
        ),
        req("GET", "/api/habits/habits?start=2026-09-28&end=2026-10-11"),
        req("PATCH", f"/api/habits/habits/{weekly}", {"rrule": None}),
        req(
            "PATCH",
            f"/api/habits/habits/{weekly}",
            {"name": " Jog ", "start_date": "2026-09-30"},
            advance=60,
        ),
        req("DELETE", f"/api/habits/habits/{daily}", advance=60),
        req("POST", f"/api/habits/habits/{daily}/restore"),
        req("GET", "/api/habits/habits?start=2026-10-01&end=2026-10-31", advance=86_400 * 2),
    ]


def data_transfer() -> list[Step]:
    """An export, merged back into the same database."""
    return [
        req("POST", "/api/todos/items", {"id": cid(80), "title": "Exported"}),
        req("POST", "/api/tags", {"id": cid(81), "name": "kept"}),
        req("GET", "/api/data/export", advance=60),
        req("POST", "/api/data/backups", {"confirm": True}),
        req("GET", "/api/cloud"),
    ]


SCENARIOS = {
    "todos_basics": todos_basics,
    "todos_repeating": todos_repeating,
    "tags_links_search": tags_links_search,
    "knowledge": knowledge,
    "calendar": calendar,
    "habits": habits,
    "data_transfer": data_transfer,
}

# Answers that depend on the backend, not on behaviour (paths, versions, sizes).
VOLATILE_KEYS = frozenset({"app_version", "size", "device_id", "device_name", "available", "path"})


class Normalizer:
    """Replaces server-made ids with ``#n`` placeholders, consistently per scenario."""

    def __init__(self) -> None:
        self.known: set[str] = set()
        self.made: dict[str, str] = {}

    def learn(self, value: Any) -> None:  # noqa: ANN401
        """Remembers every id a request names (those stay as they are)."""
        for text in _strings(value):
            self.known.update(UUID.findall(text))

    def expand(self, value: Any) -> Any:  # noqa: ANN401
        """Puts real ids in place of ``{#n}`` placeholders in a request."""
        reverse = {v: k for k, v in self.made.items()}
        if isinstance(value, str):
            return PLACEHOLDER.sub(lambda m: reverse[f"#{m[1]}"], value)
        if isinstance(value, list):
            return [self.expand(v) for v in value]  # pyright: ignore[reportUnknownVariableType]
        if isinstance(value, dict):
            return {k: self.expand(v) for k, v in value.items()}  # pyright: ignore[reportUnknownVariableType]
        return value

    def apply(self, value: Any) -> Any:  # noqa: ANN401
        """Normalises an answer (object keys visited in sorted order)."""
        if isinstance(value, str):
            return UUID.sub(self._swap, value)
        if isinstance(value, list):
            return [self.apply(v) for v in value]  # pyright: ignore[reportUnknownVariableType]
        if isinstance(value, dict):
            return {
                k: ("*" if k in VOLATILE_KEYS else self.apply(value[k]))  # pyright: ignore[reportUnknownArgumentType]
                for k in sorted(value)  # pyright: ignore[reportUnknownArgumentType, reportUnknownVariableType]
            }
        return value

    def _swap(self, match: re.Match[str]) -> str:
        found = match[0]
        if found in self.known:
            return found
        if found not in self.made:
            self.made[found] = f"#{len(self.made) + 1}"
        return self.made[found]


def _strings(value: Any) -> Iterator[str]:  # noqa: ANN401
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for v in value:  # pyright: ignore[reportUnknownVariableType]
            yield from _strings(v)
    elif isinstance(value, dict):
        for v in value.values():  # pyright: ignore[reportUnknownVariableType]
            yield from _strings(v)


def record(name: str, steps: list[Step]) -> list[dict[str, Any]]:
    """Runs a scenario on a fresh Python backend and returns its steps with answers."""
    clock = FixedClock(START)
    out: list[dict[str, Any]] = []
    norm = Normalizer()
    with tempfile.TemporaryDirectory() as tmp:
        settings = Settings(mode="test", data_dir=Path(tmp) / name, device_name="Scenario")
        with TestClient(create_app(settings, clock=clock)) as client:
            for step in steps:
                if step.get("advance"):
                    clock.advance(timedelta(seconds=step["advance"]))
                norm.learn(step.get("body"))
                norm.learn(step["path"])
                path = norm.expand(step["path"])
                body = norm.expand(step.get("body"))
                response = client.request(step["method"], path, json=body)
                data = response.json() if response.content else None
                expected: dict[str, Any] = {"status": response.status_code}
                if response.status_code >= 400:
                    expected["code"] = data["code"] if isinstance(data, dict) else None
                else:
                    expected["body"] = norm.apply(data)
                out.append({**step, "expect": expected})
    return out


def build() -> dict[str, Any]:
    """Every scenario, recorded."""
    return {
        "start": START.isoformat(),
        "scenarios": {n: record(n, f()) for n, f in SCENARIOS.items()},
    }


def render() -> str:
    """The committed JSON: one line per step, so diffs stay readable."""
    data = build()
    parts = []
    for name, steps in data["scenarios"].items():
        lines = ",\n".join(json.dumps(s, sort_keys=True, ensure_ascii=False) for s in steps)
        parts.append(f'"{name}": [\n{lines}\n]')
    return '{"start": "' + data["start"] + '",\n"scenarios": {\n' + ",\n".join(parts) + "\n}}\n"


if __name__ == "__main__":
    SCENARIOS_FILE.write_text(render(), encoding="utf-8", newline="\n")
    print(f"wrote {SCENARIOS_FILE}")
