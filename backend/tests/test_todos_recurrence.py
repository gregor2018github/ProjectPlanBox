"""Repeating todos: rules, the next occurrence on completion, and undo by reopening.

The fixed clock makes "today" Thursday 2026-10-08 in Amsterdam.
"""

from fastapi.testclient import TestClient
from todos_helpers import Json, by_id, current, move, ok, todo


def _patch(client: TestClient, todo_id: str, **body: object) -> Json:
    return ok(client.patch(f"/api/todos/items/{todo_id}", json=body))


def _complete(client: TestClient, todo_id: str) -> list[Json]:
    return ok(client.post(f"/api/todos/items/{todo_id}/complete"))["todos"]


def _open(client: TestClient) -> list[Json]:
    return [t for t in current(client) if t["completed_at"] is None]


def test_a_rule_is_anchored_on_the_due_date(client: TestClient) -> None:
    """The rule is normalised; without a due date the repeat starts today."""
    dated = todo(client, "Bins", due_date="2026-10-12")
    undated = todo(client, "Plants")

    weekly = _patch(client, dated["id"], rrule="rrule:freq=weekly;byday=mo,th")
    daily = _patch(client, undated["id"], rrule="FREQ=DAILY;INTERVAL=3")

    assert (weekly["rrule"], weekly["recurrence_anchor"]) == (
        "FREQ=WEEKLY;BYDAY=MO,TH",
        "2026-10-12",
    )
    assert (daily["due_date"], daily["recurrence_anchor"]) == ("2026-10-08", "2026-10-08")


def test_create_with_a_rule(client: TestClient) -> None:
    """A todo can be created repeating."""
    created = todo(client, "Stand-up", rrule="FREQ=DAILY")

    assert (created["rrule"], created["due_date"]) == ("FREQ=DAILY", "2026-10-08")


def test_completing_inserts_the_next_occurrence(client: TestClient) -> None:
    """The copy keeps title, notes, priority, tags and the rule, right after the original."""
    tag = ok(client.post("/api/tags", json={"name": "home"}), 201)
    first = todo(
        client,
        "Water plants",
        notes="balcony too",
        priority=2,
        due_date="2026-10-08",
        tag_ids=[tag["id"]],
        rrule="FREQ=WEEKLY",
    )
    later = todo(client, "Later")

    changed = _complete(client, first["id"])

    assert len(changed) == 2
    nxt = next(t for t in changed if t["id"] != first["id"])
    assert (nxt["title"], nxt["notes"], nxt["priority"], nxt["tag_ids"]) == (
        "Water plants",
        "balcony too",
        2,
        [tag["id"]],
    )
    assert (nxt["due_date"], nxt["rrule"], nxt["completed_at"]) == (
        "2026-10-15",
        "FREQ=WEEKLY",
        None,
    )
    assert first["position"] < nxt["position"] < later["position"]


def test_missed_dates_are_skipped(client: TestClient) -> None:
    """An overdue todo comes back on the first date after today, on its chosen weekdays."""
    daily = todo(client, "Daily", due_date="2026-10-01", rrule="FREQ=DAILY")
    days = todo(client, "MWF", due_date="2026-10-05", rrule="FREQ=WEEKLY;BYDAY=MO,WE,FR")

    _complete(client, daily["id"])
    _complete(client, days["id"])

    due = {t["title"]: t["due_date"] for t in _open(client)}
    assert due == {"Daily": "2026-10-09", "MWF": "2026-10-09"}


def test_early_completion_moves_past_the_due_date(client: TestClient) -> None:
    """Done before it is due, the next one follows the due date, not today."""
    early = todo(client, "Rent", due_date="2026-10-15", rrule="FREQ=MONTHLY")

    _complete(client, early["id"])

    assert [t["due_date"] for t in _open(client)] == ["2026-11-15"]


def test_monthly_and_yearly_keep_their_day(client: TestClient) -> None:
    """Every 2 months on the 31st lands on the next 31st after today; yearly keeps the date."""
    monthly = todo(client, "Pay", due_date="2026-08-31", rrule="FREQ=MONTHLY;INTERVAL=2")
    yearly = todo(client, "Birthday", due_date="2026-03-14", rrule="FREQ=YEARLY")

    _complete(client, monthly["id"])
    _complete(client, yearly["id"])

    due = {t["title"]: t["due_date"] for t in _open(client)}
    assert due == {"Pay": "2026-10-31", "Birthday": "2027-03-14"}


def test_moving_one_occurrence_keeps_the_series(client: TestClient) -> None:
    """Changing the due date moves this one only; changing the rule re-anchors."""
    created = todo(client, "Gym", due_date="2026-10-08", rrule="FREQ=WEEKLY")
    moved = _patch(client, created["id"], due_date="2026-10-10")

    _complete(client, created["id"])

    assert moved["recurrence_anchor"] == "2026-10-08"
    assert [t["due_date"] for t in _open(client)] == ["2026-10-15"]


def test_subtasks_come_back_open_with_shifted_dates(client: TestClient) -> None:
    """The next occurrence gets fresh, open copies of every subtask."""
    parent = todo(client, "Clean", due_date="2026-10-08", rrule="FREQ=DAILY;INTERVAL=2")
    done = todo(client, "Kitchen", parent_id=parent["id"])
    todo(client, "Bath", parent_id=parent["id"], due_date="2026-10-07")
    _complete(client, done["id"])

    _complete(client, parent["id"])

    items = _open(client)
    nxt = next(t for t in items if t["parent_id"] is None)
    subtasks = {t["title"]: t for t in items if t["parent_id"] == nxt["id"]}
    assert nxt["due_date"] == "2026-10-10"
    assert set(subtasks) == {"Kitchen", "Bath"}
    assert subtasks["Bath"]["due_date"] == "2026-10-09"


def test_reopening_takes_the_next_occurrence_back(client: TestClient) -> None:
    """Undo by reopening deletes the open copy (and its subtasks); completing again recreates it."""
    created = todo(client, "Plants", due_date="2026-10-08", rrule="FREQ=DAILY")
    todo(client, "Water", parent_id=created["id"])
    _complete(client, created["id"])

    ok(client.post(f"/api/todos/items/{created['id']}/reopen"))
    after_reopen = _open(client)
    _complete(client, created["id"])

    assert {t["title"] for t in after_reopen} == {"Plants", "Water"}
    assert len(after_reopen) == 2
    assert len(_open(client)) == 2


def test_reopening_after_the_series_moved_on_stops_repeating(client: TestClient) -> None:
    """If the next one is done too, the reopened todo becomes a one-off."""
    first = todo(client, "Plants", due_date="2026-10-08", rrule="FREQ=DAILY")
    second = next(t for t in _complete(client, first["id"]) if t["id"] != first["id"])
    third = next(t for t in _complete(client, second["id"]) if t["id"] != second["id"])

    reopened = ok(client.post(f"/api/todos/items/{first['id']}/reopen"))["todos"]

    assert by_id(reopened)[first["id"]]["rrule"] is None
    assert third["id"] in by_id(_open(client))


def test_a_finished_series_stops(client: TestClient) -> None:
    """COUNT and UNTIL end the series; the last one has no successor."""
    counted = todo(client, "Twice", due_date="2026-10-08", rrule="FREQ=DAILY;COUNT=2")
    until = todo(client, "Until", due_date="2026-10-08", rrule="FREQ=DAILY;UNTIL=20261008")

    second = next(t for t in _complete(client, counted["id"]) if t["id"] != counted["id"])
    last = _complete(client, second["id"])
    only = _complete(client, until["id"])

    assert (len(last), len(only)) == (1, 1)
    assert _open(client) == []


def test_clearing_the_rule_or_the_date_stops_repeating(client: TestClient) -> None:
    """rrule: null, or due_date: null, ends the repeat."""
    a = todo(client, "A", rrule="FREQ=DAILY")
    b = todo(client, "B", rrule="FREQ=DAILY")

    no_rule = _patch(client, a["id"], rrule=None)
    no_date = _patch(client, b["id"], due_date=None)

    assert (no_rule["rrule"], no_rule["recurrence_anchor"], no_rule["due_date"]) == (
        None,
        None,
        "2026-10-08",
    )
    assert (no_date["rrule"], no_date["due_date"]) == (None, None)
    assert len(_complete(client, a["id"])) == 1


def test_invalid_and_disallowed_rules(client: TestClient) -> None:
    """Bad rules, repeating subtasks and repeating todos becoming subtasks are refused."""
    parent = todo(client, "Parent")
    child = todo(client, "Child", parent_id=parent["id"])
    repeating = todo(client, "Repeating", rrule="FREQ=WEEKLY")
    url = f"/api/todos/items/{parent['id']}"

    assert client.patch(url, json={"rrule": "FREQ=HOURLY"}).status_code == 422
    assert client.patch(url, json={"rrule": "FREQ=DAILY;COUNT=0"}).status_code == 422
    assert (
        client.patch(f"/api/todos/items/{child['id']}", json={"rrule": "FREQ=DAILY"}).status_code
        == 422
    )
    assert move(client, repeating["id"], parent_id=parent["id"]).status_code == 422
