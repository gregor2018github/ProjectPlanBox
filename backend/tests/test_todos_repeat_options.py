"""Repeating todos, beyond the basics: repeating from completion, skipping, the forecast.

The fixed clock makes "today" Thursday 2026-10-08 in Amsterdam.
"""

from fastapi.testclient import TestClient
from todos_helpers import Json, by_id, current, ok, todo


def _patch(client: TestClient, todo_id: str, **body: object) -> Json:
    return ok(client.patch(f"/api/todos/items/{todo_id}", json=body))


def _complete(client: TestClient, todo_id: str) -> list[Json]:
    return ok(client.post(f"/api/todos/items/{todo_id}/complete"))["todos"]


def _next(client: TestClient, todo_id: str) -> Json:
    return next(t for t in _complete(client, todo_id) if t["id"] != todo_id)


def _skip(client: TestClient, todo_id: str, status: int = 200) -> Json:
    return ok(client.post(f"/api/todos/items/{todo_id}/skip"), status)


def _forecast(client: TestClient, start: str, end: str) -> list[tuple[str, str]]:
    found = ok(client.get("/api/todos/forecast", params={"start": start, "end": end}))
    return [(f["todo_id"], f["date"]) for f in found]


# ------------------------------------------------------------ series start


def test_an_undated_rule_starts_on_its_first_date(client: TestClient) -> None:
    """Every Monday, set on a Thursday, is due next Monday, not today."""
    created = todo(client, "Bins", rrule="FREQ=WEEKLY;BYDAY=MO")
    patched = _patch(client, todo(client, "Rent")["id"], rrule="FREQ=MONTHLY;BYMONTHDAY=1,15")

    assert (created["due_date"], created["recurrence_anchor"]) == ("2026-10-12", "2026-10-12")
    assert (patched["due_date"], patched["recurrence_anchor"]) == ("2026-10-15", "2026-10-15")


def test_several_days_of_the_month(client: TestClient) -> None:
    """BYMONTHDAY with several days walks through them in order."""
    rent = todo(client, "Pay", due_date="2026-10-15", rrule="FREQ=MONTHLY;BYMONTHDAY=1,15")

    assert _next(client, rent["id"])["due_date"] == "2026-11-01"


# --------------------------------------------------- repeat from completion


def test_repeating_from_completion_counts_from_today(client: TestClient) -> None:
    """Done today (overdue or early), the next one is one interval after today."""
    overdue = todo(
        client,
        "Water",
        due_date="2026-10-05",
        rrule="FREQ=DAILY;INTERVAL=3",
        repeat_from="completion",
    )
    early = todo(client, "Haircut", due_date="2026-10-20", rrule="FREQ=WEEKLY;INTERVAL=4")
    _patch(client, early["id"], repeat_from="completion")

    after_overdue = _next(client, overdue["id"])
    after_early = _next(client, early["id"])

    assert overdue["repeat_from"] == "completion"
    assert (after_overdue["due_date"], after_overdue["recurrence_anchor"]) == (
        "2026-10-11",
        "2026-10-11",
    )
    assert after_overdue["repeat_from"] == "completion"
    assert after_early["due_date"] == "2026-11-05"


def test_repeating_from_completion_counts_down(client: TestClient) -> None:
    """Ending after 2 times: the second one carries COUNT=1 and has no successor."""
    first = todo(client, "Twice", rrule="FREQ=DAILY;INTERVAL=2;COUNT=2", repeat_from="completion")

    second = _next(client, first["id"])

    assert second["rrule"] == "FREQ=DAILY;INTERVAL=2;COUNT=1"
    assert len(_complete(client, second["id"])) == 1


def test_only_plain_rules_repeat_from_completion(client: TestClient) -> None:
    """Weekdays or month days need a schedule; the mode change alone keeps the series."""
    weekly = todo(client, "Gym", rrule="FREQ=WEEKLY;BYDAY=MO,TH")
    plain = todo(client, "Plants", due_date="2026-10-10", rrule="FREQ=WEEKLY")

    refused = client.post(
        "/api/todos/items",
        json={"title": "X", "rrule": "FREQ=WEEKLY;BYDAY=MO", "repeat_from": "completion"},
    )
    mode_only = client.patch(f"/api/todos/items/{weekly['id']}", json={"repeat_from": "completion"})
    switched = _patch(client, plain["id"], repeat_from="completion")

    assert (refused.status_code, mode_only.status_code) == (422, 422)
    assert (switched["repeat_from"], switched["rrule"], switched["due_date"]) == (
        "completion",
        "FREQ=WEEKLY",
        "2026-10-10",
    )


def test_stopping_the_repeat_resets_the_mode(client: TestClient) -> None:
    """Without a rule, repeat_from is back to "due"."""
    water = todo(client, "Water", rrule="FREQ=DAILY", repeat_from="completion")

    stopped = _patch(client, water["id"], rrule=None)

    assert (stopped["rrule"], stopped["repeat_from"]) == (None, "due")


# ------------------------------------------------------------------- skip


def test_skip_moves_to_the_next_date_that_is_not_past(client: TestClient) -> None:
    """On a schedule: after the due date, but today still counts when overdue."""
    weekly = todo(client, "Bins", due_date="2026-10-08", rrule="FREQ=WEEKLY")
    overdue = todo(client, "Stretch", due_date="2026-10-05", rrule="FREQ=DAILY")

    assert _skip(client, weekly["id"])["due_date"] == "2026-10-15"
    assert _skip(client, overdue["id"])["due_date"] == "2026-10-08"
    assert len([t for t in current(client) if t["completed_at"] is None]) == 2


def test_skip_from_completion_steps_from_the_due_date(client: TestClient) -> None:
    """Every 3 days, due 1 Oct: 4th and 7th are past, so the 10th."""
    water = todo(
        client,
        "Water",
        due_date="2026-10-01",
        rrule="FREQ=DAILY;INTERVAL=3;COUNT=2",
        repeat_from="completion",
    )

    skipped = _skip(client, water["id"])

    assert (skipped["due_date"], skipped["rrule"]) == ("2026-10-10", water["rrule"])


def test_undo_a_skip_by_moving_the_date_back(client: TestClient) -> None:
    """The client undoes a skip with a due date patch; the series is untouched."""
    bins = todo(client, "Bins", due_date="2026-10-08", rrule="FREQ=WEEKLY")
    _skip(client, bins["id"])

    restored = _patch(client, bins["id"], due_date="2026-10-08")

    assert (restored["due_date"], restored["rrule"], restored["recurrence_anchor"]) == (
        "2026-10-08",
        "FREQ=WEEKLY",
        "2026-10-08",
    )


def test_skip_is_refused_when_it_cannot_apply(client: TestClient) -> None:
    """Not repeating (422), already done or the last date (409)."""
    plain = todo(client, "Once", due_date="2026-10-08")
    last = todo(client, "Last", due_date="2026-10-08", rrule="FREQ=DAILY;COUNT=1")
    done = todo(client, "Done", rrule="FREQ=DAILY")
    _complete(client, done["id"])

    _skip(client, plain["id"], 422)
    _skip(client, last["id"], 409)
    _skip(client, done["id"], 409)


# --------------------------------------------------------------- forecast


def test_forecast_lists_later_dates_of_open_repeating_todos(client: TestClient) -> None:
    """Dates after the due date (or today when overdue); not the due date itself."""
    daily = todo(client, "Daily", due_date="2026-10-08", rrule="FREQ=DAILY;COUNT=3")
    overdue = todo(client, "Weekly", due_date="2026-10-01", rrule="FREQ=WEEKLY")
    stepped = todo(
        client,
        "Stepped",
        due_date="2026-10-10",
        rrule="FREQ=DAILY;INTERVAL=2",
        repeat_from="completion",
    )
    done = todo(client, "Done", due_date="2026-10-08", rrule="FREQ=DAILY")
    _complete(client, done["id"])
    successor = next(
        t for t in current(client) if t["title"] == "Done" and t["completed_at"] is None
    )

    found = _forecast(client, "2026-10-08", "2026-10-15")

    by_todo: dict[str, list[str]] = {}
    for todo_id, day in found:
        by_todo.setdefault(todo_id, []).append(day)
    assert by_todo[daily["id"]] == ["2026-10-09", "2026-10-10"]
    assert by_todo[overdue["id"]] == ["2026-10-15"]
    assert by_todo[stepped["id"]] == ["2026-10-12", "2026-10-14"]
    assert done["id"] not in by_todo
    assert by_todo[successor["id"]][0] == "2026-10-10"
    assert set(by_id([daily, overdue, stepped, successor])) == set(by_todo)


def test_forecast_range_is_checked(client: TestClient) -> None:
    """A reversed or too long range is refused."""
    url = "/api/todos/forecast"

    reversed_range = client.get(url, params={"start": "2026-10-10", "end": "2026-10-01"})
    too_long = client.get(url, params={"start": "2026-01-01", "end": "2027-12-31"})

    assert (reversed_range.status_code, too_long.status_code) == (422, 422)
