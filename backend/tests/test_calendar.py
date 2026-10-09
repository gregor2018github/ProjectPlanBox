"""Calendar API: events, ranges, recurring series and scoped changes."""

from typing import Any

from fastapi.testclient import TestClient

from planbox.core.ids import new_id

type Json = dict[str, Any]


def ok(response: Any, status: int = 200) -> Any:  # noqa: ANN401 - JSON is untyped
    """Asserts the status and returns the JSON body."""
    assert response.status_code == status, response.text
    return response.json()


def create(client: TestClient, title: str = "Meeting", **fields: Any) -> Json:  # noqa: ANN401
    """Creates an event (a one-hour timed event on Thu 8 Oct by default)."""
    body = {
        "title": title,
        "start_at": "2026-10-08T07:00:00.000Z",
        "end_at": "2026-10-08T08:00:00.000Z",
        **fields,
    }
    return ok(client.post("/api/calendar/events", json=body), 201)


def weekly(client: TestClient, **fields: Any) -> Json:  # noqa: ANN401
    """A weekly 09:00-10:00 (Amsterdam) series starting Monday 5 October."""
    return create(
        client,
        "Standup",
        start_at="2026-10-05T07:00:00.000Z",
        end_at="2026-10-05T08:00:00.000Z",
        rrule="FREQ=WEEKLY",
        **fields,
    )


def in_range(client: TestClient, start: str = "2026-10-01", end: str = "2026-11-01") -> Json:
    """Events and occurrences in a range."""
    return ok(client.get(f"/api/calendar/events?start={start}&end={end}"))


def occurrences_of(data: Json, event_id: str) -> list[str]:
    """Occurrence dates of one event."""
    return [o["occurrence_date"] for o in data["occurrences"] if o["event_id"] == event_id]


def test_timed_event_appears_in_overlapping_ranges_only(client: TestClient) -> None:
    """Ranges are local dates; the event is on Thursday 8 October."""
    event = create(client)
    assert event["all_day"] is False
    assert event["start_at"] == "2026-10-08T07:00:00.000Z"
    data = in_range(client, "2026-10-08", "2026-10-09")
    assert [e["id"] for e in data["events"]] == [event["id"]]
    assert data["occurrences"][0]["occurrence_date"] == "2026-10-08"
    assert in_range(client, "2026-10-09", "2026-10-10")["events"] == []


def test_all_day_event_spans_its_inclusive_dates(client: TestClient) -> None:
    """A three-day event shows in a range touching only its last day."""
    event = create(client, "Trip", all_day=True, start_date="2026-10-10", end_date="2026-10-12")
    assert event["start_at"] is None
    assert [e["id"] for e in in_range(client, "2026-10-12", "2026-10-13")["events"]] == [
        event["id"]
    ]
    assert in_range(client, "2026-10-13", "2026-10-14")["events"] == []


def test_create_is_idempotent_per_client_id(client: TestClient) -> None:
    """Retrying a create returns the existing row."""
    event_id = new_id()
    body = {
        "id": event_id,
        "title": "Once",
        "all_day": True,
        "start_date": "2026-10-08",
        "end_date": "2026-10-08",
    }
    ok(client.post("/api/calendar/events", json=body), 201)
    assert ok(client.post("/api/calendar/events", json=body), 200)["id"] == event_id


def test_invalid_events_are_refused(client: TestClient) -> None:
    """Naive times, inverted ranges, missing dates and bad rules are 422s."""
    bad = [
        {"title": "x", "start_at": "2026-10-08T07:00:00", "end_at": "2026-10-08T08:00:00"},
        {"title": "x", "start_at": "2026-10-08T08:00:00Z", "end_at": "2026-10-08T07:00:00Z"},
        {"title": "x", "all_day": True, "start_date": "2026-10-08"},
        {"title": " ", "all_day": True, "start_date": "2026-10-08", "end_date": "2026-10-08"},
        {
            "title": "x",
            "all_day": True,
            "start_date": "2026-10-08",
            "end_date": "2026-10-08",
            "rrule": "FREQ=SECONDLY",
        },
    ]
    for body in bad:
        response = client.post("/api/calendar/events", json=body)
        assert response.status_code == 422, body
        assert response.headers["content-type"] == "application/problem+json"


def test_range_must_be_short_and_ordered(client: TestClient) -> None:
    """Empty, inverted and huge ranges are refused."""
    for start, end in [
        ("2026-10-08", "2026-10-08"),
        ("2026-10-08", "2026-10-01"),
        ("2026-01-01", "2026-12-31"),
    ]:
        assert client.get(f"/api/calendar/events?start={start}&end={end}").status_code == 422


def test_weekly_series_expands_in_local_time(client: TestClient) -> None:
    """Mondays at 09:00 Amsterdam: 07:00Z before 25 October, 08:00Z after."""
    series = weekly(client)
    data = in_range(client)
    assert occurrences_of(data, series["id"]) == [
        "2026-10-05",
        "2026-10-12",
        "2026-10-19",
        "2026-10-26",
    ]
    starts = [o["start_at"] for o in data["occurrences"]]
    assert starts[-1] == "2026-10-26T08:00:00.000Z"
    assert [e["id"] for e in data["events"]] == [series["id"]]


def test_change_this_occurrence_detaches_it(client: TestClient) -> None:
    """The series skips that Monday and a single event takes its place."""
    series = weekly(client)
    split_id = new_id()
    out = ok(
        client.patch(
            f"/api/calendar/events/{series['id']}",
            json={
                "scope": "this",
                "occurrence_date": "2026-10-12",
                "split_id": split_id,
                "title": "Standup (moved)",
                "start_at": "2026-10-13T07:00:00Z",
                "end_at": "2026-10-13T08:00:00Z",
            },
        )
    )
    assert [e["id"] for e in out["events"]] == [series["id"], split_id]
    assert out["events"][1]["rrule"] is None
    data = in_range(client)
    assert occurrences_of(data, series["id"]) == ["2026-10-05", "2026-10-19", "2026-10-26"]
    assert occurrences_of(data, split_id) == ["2026-10-13"]
    assert out["events"][1]["title"] == "Standup (moved)"


def test_change_following_splits_the_series(client: TestClient) -> None:
    """The original ends before the occurrence; a new series continues from there."""
    series = weekly(client)
    out = ok(
        client.patch(
            f"/api/calendar/events/{series['id']}",
            json={
                "scope": "following",
                "occurrence_date": "2026-10-19",
                "title": "Sync",
            },
        )
    )
    head, tail = out["events"]
    assert head["rrule"] == "FREQ=WEEKLY;UNTIL=20261018T215959Z"
    assert tail["title"] == "Sync"
    assert tail["rrule"] == "FREQ=WEEKLY"
    data = in_range(client)
    assert occurrences_of(data, head["id"]) == ["2026-10-05", "2026-10-12"]
    assert occurrences_of(data, tail["id"]) == ["2026-10-19", "2026-10-26"]


def test_change_following_at_the_first_occurrence_changes_all(client: TestClient) -> None:
    """Nothing would remain of the head, so the series itself changes."""
    series = weekly(client)
    out = ok(
        client.patch(
            f"/api/calendar/events/{series['id']}",
            json={
                "scope": "following",
                "occurrence_date": "2026-10-05",
                "title": "Renamed",
            },
        )
    )
    assert [e["id"] for e in out["events"]] == [series["id"]]
    assert out["events"][0]["title"] == "Renamed"


def test_moving_a_series_by_a_day_moves_its_exceptions(client: TestClient) -> None:
    """A skipped Monday stays skipped when the series moves to Tuesdays."""
    series = weekly(client)
    ok(client.delete(f"/api/calendar/events/{series['id']}?scope=this&occurrence_date=2026-10-12"))
    ok(
        client.patch(
            f"/api/calendar/events/{series['id']}",
            json={
                "start_at": "2026-10-06T07:00:00Z",
                "end_at": "2026-10-06T08:00:00Z",
            },
        )
    )
    assert occurrences_of(in_range(client), series["id"]) == [
        "2026-10-06",
        "2026-10-20",
        "2026-10-27",
    ]


def test_delete_this_occurrence_and_undo(client: TestClient) -> None:
    """Deleting one occurrence skips it; restoring brings it back."""
    series = weekly(client)
    url = f"/api/calendar/events/{series['id']}"
    ok(client.delete(f"{url}?scope=this&occurrence_date=2026-10-19"))
    assert "2026-10-19" not in occurrences_of(in_range(client), series["id"])
    assert client.delete(f"{url}?scope=this&occurrence_date=2026-10-19").status_code == 404
    ok(client.post(f"{url}/occurrences/2026-10-19/restore"))
    assert "2026-10-19" in occurrences_of(in_range(client), series["id"])


def test_delete_following_ends_the_series_and_undo_restores_the_rule(client: TestClient) -> None:
    """The client undoes a 'following' delete by patching the old rule back."""
    series = weekly(client)
    url = f"/api/calendar/events/{series['id']}"
    out = ok(client.delete(f"{url}?scope=following&occurrence_date=2026-10-19"))
    assert out["events"][0]["rrule"].startswith("FREQ=WEEKLY;UNTIL=")
    assert occurrences_of(in_range(client), series["id"]) == ["2026-10-05", "2026-10-12"]
    ok(client.patch(url, json={"rrule": "FREQ=WEEKLY"}))
    assert len(occurrences_of(in_range(client), series["id"])) == 4


def test_delete_all_and_restore(client: TestClient) -> None:
    """A deleted event disappears and comes back on restore."""
    event = create(client)
    url = f"/api/calendar/events/{event['id']}"
    assert ok(client.delete(url)) == {"events": []}
    assert in_range(client)["events"] == []
    assert client.get(url).status_code == 404
    ok(client.post(f"{url}/restore"))
    assert [e["id"] for e in in_range(client)["events"]] == [event["id"]]


def test_switching_to_all_day_needs_dates(client: TestClient) -> None:
    """Changing the kind replaces the timing; a half-given one is refused."""
    event = create(client)
    url = f"/api/calendar/events/{event['id']}"
    assert client.patch(url, json={"all_day": True}).status_code == 422
    out = ok(
        client.patch(
            url,
            json={
                "all_day": True,
                "start_date": "2026-10-08",
                "end_date": "2026-10-08",
            },
        )
    )
    changed = out["events"][0]
    assert changed["all_day"] is True
    assert changed["start_at"] is None


def test_scoped_change_needs_a_real_occurrence(client: TestClient) -> None:
    """A date the series does not hit is a 404; no date is a 422."""
    series = weekly(client)
    url = f"/api/calendar/events/{series['id']}"
    assert client.patch(url, json={"scope": "this", "title": "x"}).status_code == 422
    response = client.patch(
        url, json={"scope": "this", "occurrence_date": "2026-10-06", "title": "x"}
    )
    assert response.status_code == 404


def test_detached_event_cannot_take_a_rule(client: TestClient) -> None:
    """A repeat rule only makes sense for all or following events."""
    series = weekly(client)
    response = client.patch(
        f"/api/calendar/events/{series['id']}",
        json={
            "scope": "this",
            "occurrence_date": "2026-10-12",
            "rrule": "FREQ=DAILY",
        },
    )
    assert response.status_code == 422
