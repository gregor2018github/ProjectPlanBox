"""Shutting down from the app, and the request-origin protections around it."""

from fastapi.testclient import TestClient

from planbox.config import Settings
from planbox.core.clock import FixedClock
from planbox.main import create_app


def launcher_client(settings: Settings, clock: FixedClock, calls: list[str]) -> TestClient:
    """A client for an app started the way main.py starts it (with a shutdown hook)."""
    app = create_app(settings, clock=clock, request_shutdown=lambda: calls.append("stop"))
    return TestClient(app)


def test_meta_tells_whether_shutdown_is_available(
    settings: Settings, clock: FixedClock, client: TestClient
) -> None:
    """Only a launcher-started server offers the button."""
    calls: list[str] = []
    with launcher_client(settings, clock, calls) as launched:
        assert launched.get("/api/meta").json()["can_shutdown"] is True
    assert client.get("/api/meta").json()["can_shutdown"] is False


def test_shutdown_responds_then_stops(settings: Settings, clock: FixedClock) -> None:
    """The hook runs after the 202 response, so the browser gets an answer."""
    calls: list[str] = []
    with launcher_client(settings, clock, calls) as client:
        response = client.post("/api/shutdown", json={"confirm": True})

    assert response.status_code == 202
    assert response.json() == {"status": "stopping"}
    assert calls == ["stop"]


def test_shutdown_without_launcher_is_a_conflict(client: TestClient) -> None:
    """The dev server is stopped by dev.py, not from the app."""
    response = client.post("/api/shutdown", json={"confirm": True})

    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


def test_shutdown_needs_a_json_confirmation(settings: Settings, clock: FixedClock) -> None:
    """Form posts and text/plain bodies, which websites can send cross-site, are refused."""
    calls: list[str] = []
    with launcher_client(settings, clock, calls) as client:
        missing = client.post("/api/shutdown", json={})
        as_form = client.post("/api/shutdown", data={"confirm": "true"})
        as_text = client.post(
            "/api/shutdown",
            content='{"confirm": true}',
            headers={"content-type": "text/plain"},
        )

    assert [r.status_code for r in (missing, as_form, as_text)] == [422, 422, 422]
    assert calls == []


def test_foreign_host_headers_are_rejected(client: TestClient) -> None:
    """DNS rebinding: a page on evil.example resolving to 127.0.0.1 gets nothing."""
    rebound = client.get("/api/health", headers={"host": "evil.example:8765"})
    loopback = client.get("/api/health", headers={"host": "127.0.0.1:8765"})
    named = client.get("/api/health", headers={"host": "localhost:8765"})

    assert rebound.status_code == 400
    assert loopback.status_code == 200
    assert named.status_code == 200
