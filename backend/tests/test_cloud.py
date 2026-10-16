"""Google Drive sync against a fake Google: sign-in, upload, download, merge."""

import gzip
import json
import urllib.parse
from collections.abc import Iterator
from pathlib import Path
from typing import cast

import pytest
from fake_google import FakeGoogle
from fastapi import FastAPI
from fastapi.testclient import TestClient

from planbox.config import Settings, load_settings
from planbox.core.clock import FixedClock
from planbox.main import create_app

CONFIRM = {"confirm": True}
TODO_ID = "01990000-0000-7000-8000-000000000001"


def _settings(tmp_path: Path, name: str, *, ready: bool = True) -> Settings:
    return Settings(
        mode="test",
        data_dir=tmp_path / name,
        google_client_id="client" if ready else None,
        google_client_secret="secret" if ready else None,
        device_name=name,
    )


@pytest.fixture
def google() -> FakeGoogle:
    """One Google account that every device in a test shares."""
    return FakeGoogle()


def _device(
    tmp_path: Path, name: str, google: FakeGoogle, clock: FixedClock, *, ready: bool = True
) -> Iterator[TestClient]:
    app = create_app(_settings(tmp_path, name, ready=ready), clock=clock, cloud_transport=google)
    with TestClient(app, base_url="http://127.0.0.1:8765") as client:
        yield client


@pytest.fixture
def pc(tmp_path: Path, google: FakeGoogle, clock: FixedClock) -> Iterator[TestClient]:
    """The first device."""
    yield from _device(tmp_path, "home-pc", google, clock)


@pytest.fixture
def other(tmp_path: Path, google: FakeGoogle, clock: FixedClock) -> Iterator[TestClient]:
    """A second device on the same Google account."""
    yield from _device(tmp_path, "work-pc", google, clock)


def connect(client: TestClient, code: str = "good-code") -> TestClient:
    """Signs a device in the way the browser would."""
    started = client.post("/api/cloud/connect", json=CONFIRM)
    assert started.status_code == 200
    url = started.json()["auth_url"]
    query = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(url).query))
    assert query["scope"] == "https://www.googleapis.com/auth/drive.appdata"
    assert query["redirect_uri"] == "http://127.0.0.1:8765/api/cloud/callback"
    assert query["code_challenge_method"] == "S256"
    back = client.get("/api/cloud/callback", params={"state": query["state"], "code": code})
    assert back.status_code == 200, back.text
    return client


def test_status_before_anything_is_set_up(
    tmp_path: Path, google: FakeGoogle, clock: FixedClock
) -> None:
    """Status before anything is set up."""
    for client in _device(tmp_path, "bare", google, clock, ready=False):
        status = client.get("/api/cloud").json()
        assert status["available"] is False
        assert status["connected"] is False
        assert status["device_name"] == "bare"
        response = client.post("/api/cloud/connect", json=CONFIRM)
        assert response.status_code == 409
        assert "settings.toml" in response.json()["detail"]


def test_sign_in_round_trip(pc: TestClient, google: FakeGoogle) -> None:
    """Sign in round trip."""
    status = connect(pc).get("/api/cloud").json()
    assert status["connected"] is True
    assert status["connecting"] is False
    assert google.refresh_tokens  # the token is stored, not shown
    assert "refresh" not in json.dumps(status)


def test_callback_needs_the_state_of_a_started_sign_in(pc: TestClient) -> None:
    """Callback needs the state of a started sign in."""
    pc.post("/api/cloud/connect", json=CONFIRM)
    response = pc.get("/api/cloud/callback", params={"state": "forged", "code": "good-code"})
    assert response.status_code == 400
    assert pc.get("/api/cloud").json()["connected"] is False


def test_refused_code_reports_the_error(pc: TestClient) -> None:
    """Refused code reports the error."""
    with pytest.raises(AssertionError):
        connect(pc, code="bad-code")
    status = pc.get("/api/cloud").json()
    assert status["connected"] is False
    assert status["error"]


def test_upload_needs_a_connection(pc: TestClient) -> None:
    """Upload needs a connection."""
    assert pc.post("/api/cloud/upload", json=CONFIRM).status_code == 409


def test_upload_then_download_moves_data_between_devices(
    pc: TestClient, other: TestClient, google: FakeGoogle
) -> None:
    """Upload then download moves data between devices."""
    connect(pc)
    connect(other)
    pc.post("/api/todos/items", json={"id": TODO_ID, "title": "Buy milk"})

    upload = pc.post("/api/cloud/upload", json=CONFIRM).json()
    assert upload["size"] > 0
    [file] = google.files.values()
    document = json.loads(gzip.decompress(file.content))
    assert document["format"] == "planbox-export"
    assert file.properties["planbox_name"] == "home-pc"

    download = other.post("/api/cloud/download", json=CONFIRM).json()
    [merge] = download["devices"]
    assert merge["status"] == "merged"
    assert merge["device"]["name"] == "home-pc"
    assert other.get(f"/api/todos/items/{TODO_ID}").json()["title"] == "Buy milk"

    # Unchanged since the last merge: skipped.
    again = other.post("/api/cloud/download", json=CONFIRM).json()
    assert [m["status"] for m in again["devices"]] == ["unchanged"]


def test_sync_brings_changes_back(pc: TestClient, other: TestClient, clock: FixedClock) -> None:
    """Sync brings changes back."""
    from datetime import timedelta  # noqa: PLC0415

    connect(pc)
    connect(other)
    pc.post("/api/todos/items", json={"id": TODO_ID, "title": "Buy milk"})
    pc.post("/api/cloud/sync", json=CONFIRM)
    other.post("/api/cloud/sync", json=CONFIRM)
    clock.advance(timedelta(minutes=5))
    other.patch(f"/api/todos/items/{TODO_ID}", json={"title": "Buy oat milk"})
    other.post("/api/cloud/sync", json=CONFIRM)

    result = pc.post("/api/cloud/sync", json=CONFIRM).json()
    assert [m["status"] for m in result["download"]["devices"]] == ["merged"]
    assert pc.get(f"/api/todos/items/{TODO_ID}").json()["title"] == "Buy oat milk"

    devices = pc.get("/api/cloud/devices").json()
    assert [(d["name"], d["this_device"]) for d in devices] == [
        ("home-pc", True),
        ("work-pc", False),
    ]


def test_a_file_from_another_version_is_reported_not_merged(
    pc: TestClient, other: TestClient, google: FakeGoogle
) -> None:
    """A file from another version is reported not merged."""
    connect(pc)
    connect(other)
    pc.post("/api/cloud/upload", json=CONFIRM)
    [file] = google.files.values()
    document = json.loads(gzip.decompress(file.content))
    document["migrations"] = document["migrations"][:-1]
    file.content = gzip.compress(json.dumps(document).encode())

    [merge] = other.post("/api/cloud/download", json=CONFIRM).json()["devices"]
    assert merge["status"] == "failed"
    assert "version" in merge["error"]


def test_revoked_access_signs_the_device_out(pc: TestClient, google: FakeGoogle) -> None:
    """Revoked access signs the device out."""
    connect(pc)
    google.refresh_tokens.clear()
    # A new app instance has no cached access token, so it must refresh.
    cast("FastAPI", pc.app).state.cloud.token = None
    response = pc.post("/api/cloud/upload", json=CONFIRM)
    assert response.status_code == 409
    assert "Connect again" in response.json()["detail"]
    assert pc.get("/api/cloud").json()["connected"] is False


def test_offline_is_a_bad_gateway(pc: TestClient, google: FakeGoogle) -> None:
    """Offline is a bad gateway."""
    connect(pc)
    google.offline = True
    response = pc.post("/api/cloud/sync", json=CONFIRM)
    assert response.status_code == 502
    assert response.json()["code"] == "upstream_failed"


def test_disconnect_revokes_and_forgets(pc: TestClient, google: FakeGoogle) -> None:
    """Disconnect revokes and forgets."""
    connect(pc)
    status = pc.post("/api/cloud/disconnect", json=CONFIRM).json()
    assert status["connected"] is False
    assert google.revoked
    stored = cast("FastAPI", pc.app).state.settings.data_dir / "cloud.json"
    assert "refresh-" not in stored.read_text()


def test_device_id_survives_a_restart(
    tmp_path: Path, google: FakeGoogle, clock: FixedClock
) -> None:
    """Device id survives a restart."""
    ids = [
        client.get("/api/cloud").json()["device_id"]
        for _ in range(2)
        for client in _device(tmp_path, "same", google, clock)
    ]
    assert ids[0] == ids[1]


def test_cloud_settings_belong_to_the_real_database(tmp_path: Path) -> None:
    """Cloud settings belong to the real database."""
    file = tmp_path / "settings.toml"
    file.write_text(
        'google_client_id = "id"\ngoogle_client_secret = "secret"\ndevice_name = "Desk"\n',
        encoding="utf-8",
    )
    serve = load_settings("serve", env={}, settings_file=file)
    assert serve.cloud_ready
    assert serve.device_name == "Desk"
    dev = load_settings("dev", env={}, settings_file=file)
    assert not dev.cloud_ready
    env = {"PLANBOX_GOOGLE_CLIENT_ID": "a", "PLANBOX_GOOGLE_CLIENT_SECRET": "b"}
    assert load_settings("dev", env=env, settings_file=file).cloud_ready
