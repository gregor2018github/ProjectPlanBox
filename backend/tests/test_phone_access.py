"""Phone access: settings, the API guard, pairing, sessions and shared preferences."""

from collections.abc import Iterator
from datetime import timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from planbox.config import (
    NetworkSettings,
    Settings,
    SettingsError,
    check_private_address,
    load_settings,
)
from planbox.core.auth.service import SESSION_COOKIE, is_loopback
from planbox.core.clock import FixedClock
from planbox.main import allowed_hosts, create_app

PHONE = ("192.168.2.50", 51000)
DESK = ("127.0.0.1", 51001)


def ok(response: Any, status: int = 200) -> Any:  # noqa: ANN401 - JSON is untyped
    """Asserts the status and returns the JSON body."""
    assert response.status_code == status, response.text
    return response.json()


# --- settings -----------------------------------------------------------------


def test_phone_access_is_off_unless_asked_for(tmp_path: Path) -> None:
    """No settings, no listener beyond loopback."""
    assert load_settings("serve", env={}, settings_file=tmp_path / "none.toml").network is None


def test_phone_access_reads_settings_toml_for_the_real_database_only(tmp_path: Path) -> None:
    """Scratch and dev data dirs never pick up the owner's network settings."""
    file = tmp_path / "settings.toml"
    file.write_text(
        'network = true\nnetwork_address = "192.168.2.12"\nnetwork_hostname = "desk.local"\n',
        encoding="utf-8",
    )
    real = load_settings("serve", env={}, settings_file=file)
    assert real.network == NetworkSettings(address="192.168.2.12", hostname="desk.local")
    scratch = {"PLANBOX_DATA_DIR": str(tmp_path / "scratch")}
    assert load_settings("serve", env=scratch, settings_file=file).network is None
    assert load_settings("dev", env={}, settings_file=file).network is None


def test_tls_files_go_together(tmp_path: Path) -> None:
    """A certificate without a key (or the reverse) is a settings error."""
    env = {
        "PLANBOX_NETWORK": "1",
        "PLANBOX_NETWORK_ADDRESS": "10.0.0.5",
        "PLANBOX_NETWORK_TLS_CERT": "cert.pem",
    }
    with pytest.raises(SettingsError, match="go together"):
        load_settings("dev", env=env, settings_file=tmp_path / "none.toml")
    env["PLANBOX_NETWORK_TLS_KEY"] = "key.pem"
    network = load_settings("dev", env=env, settings_file=tmp_path / "none.toml").network
    assert network is not None
    assert network.tls


@pytest.mark.parametrize("address", ["192.168.1.20", "10.1.2.3", "172.16.0.9", "100.101.102.103"])
def test_private_and_tailscale_addresses_are_accepted(address: str) -> None:
    """Home networks and Tailscale."""
    check_private_address(address)


@pytest.mark.parametrize(
    "address",
    ["0.0.0.0", "127.0.0.1", "8.8.8.8", "169.254.1.1", "::1", "desk.local"],  # noqa: S104
)
def test_anything_else_is_refused(address: str) -> None:
    """Never all interfaces, never a public address."""
    with pytest.raises(SettingsError):
        check_private_address(address)


def test_loopback_detection() -> None:
    """Every loopback form counts as this PC."""
    assert is_loopback("127.0.0.1")
    assert is_loopback("127.0.0.2")
    assert is_loopback("::1")
    assert is_loopback("::ffff:127.0.0.1")
    assert not is_loopback("192.168.2.50")
    assert not is_loopback("testclient")
    assert not is_loopback(None)


# --- the guard ----------------------------------------------------------------


@pytest.fixture
def network_settings(tmp_path: Path) -> Settings:
    """Test settings with phone access on."""
    return Settings(
        mode="test",
        data_dir=tmp_path / "data",
        port=0,
        network=NetworkSettings(address="192.168.2.12", hostname="desk.local"),
    )


@pytest.fixture
def phone(network_settings: Settings, clock: FixedClock) -> Iterator[TestClient]:
    """A client on the private network."""
    app = create_app(network_settings, clock=clock, request_shutdown=lambda: None)
    with TestClient(app, client=PHONE, base_url="http://192.168.2.12") as client:
        yield client


@pytest.fixture
def desk(phone: TestClient) -> TestClient:
    """A client on this PC, against the same app."""
    return TestClient(phone.app, client=DESK, base_url="http://127.0.0.1")


def pair(desk: TestClient, phone: TestClient) -> None:
    """Shows a code on the desk and types it on the phone."""
    code = ok(desk.post("/api/auth/pairing", json={"confirm": True}), 201)["code"]
    ok(phone.post("/api/auth/sign-in", json={"code": code}))


def test_the_private_address_and_hostname_are_accepted_hosts(
    network_settings: Settings,
) -> None:
    """The Host check grows by exactly the configured names."""
    assert allowed_hosts(network_settings) == [
        "127.0.0.1",
        "localhost",
        "192.168.2.12",
        "desk.local",
        "testserver",
    ]


def test_an_unpaired_phone_gets_the_shell_but_no_data(phone: TestClient) -> None:
    """Only the session and sign-in endpoints answer without a session."""
    problem = ok(phone.get("/api/todos/items", params={"completed_since": "2026-10-08"}), 401)
    assert problem["code"] == "unauthorized"
    ok(phone.get("/api/health"), 401)
    assert ok(phone.get("/api/auth/session")) == {
        "signed_in": False,
        "local": False,
        "phone_access": True,
    }


def test_this_pc_never_signs_in(desk: TestClient) -> None:
    """Loopback clients use everything as before."""
    ok(desk.get("/api/health"))
    assert ok(desk.get("/api/auth/session"))["signed_in"] is True


def test_pairing_signs_the_phone_in_for_good(
    desk: TestClient, phone: TestClient, clock: FixedClock
) -> None:
    """A code works once; the cookie is HttpOnly and SameSite=Strict."""
    code = ok(desk.post("/api/auth/pairing", json={"confirm": True}), 201)["code"]
    assert len(code) == 9
    assert code[4] == "-"
    response = phone.post("/api/auth/sign-in", json={"code": code.replace("-", " ").lower()})
    ok(response)
    cookie = response.headers["set-cookie"]
    assert SESSION_COOKIE in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie

    ok(phone.get("/api/health"))
    clock.advance(timedelta(days=399))
    ok(phone.get("/api/health"))
    ok(phone.post("/api/auth/sign-in", json={"code": code}), 401)  # used up
    clock.advance(timedelta(days=2))
    ok(phone.get("/api/health"), 401)  # 400 days are over


def test_codes_expire_and_wrong_guesses_void_them(
    desk: TestClient, phone: TestClient, clock: FixedClock
) -> None:
    """Ten minutes, five tries."""
    code = ok(desk.post("/api/auth/pairing", json={"confirm": True}), 201)["code"]
    clock.advance(timedelta(minutes=11))
    assert (
        "No pairing code" in ok(phone.post("/api/auth/sign-in", json={"code": code}), 401)["detail"]
    )

    code = ok(desk.post("/api/auth/pairing", json={"confirm": True}), 201)["code"]
    for _ in range(4):
        ok(phone.post("/api/auth/sign-in", json={"code": "WRONG-CODE"}), 401)
    problem = ok(phone.post("/api/auth/sign-in", json={"code": "WRONG-CODE"}), 401)
    assert "Too many" in problem["detail"]
    ok(phone.post("/api/auth/sign-in", json={"code": code}), 401)
    assert ok(desk.get("/api/auth/phones"))["pairing"] is None


def test_only_this_pc_pairs_and_shuts_down(desk: TestClient, phone: TestClient) -> None:
    """A signed-in phone still cannot pair others, sign everyone out, or stop PlanBox."""
    pair(desk, phone)
    ok(phone.post("/api/auth/pairing", json={"confirm": True}), 403)
    ok(phone.post("/api/auth/sign-out-everywhere", json={"confirm": True}), 403)
    ok(phone.get("/api/auth/phones"), 403)
    ok(phone.post("/api/shutdown", json={"confirm": True}), 403)
    assert ok(phone.get("/api/meta"))["can_shutdown"] is False
    assert ok(desk.get("/api/meta"))["can_shutdown"] is True


def test_signing_out_everywhere_needs_new_pairing(desk: TestClient, phone: TestClient) -> None:
    """Replacing the key invalidates every session."""
    pair(desk, phone)
    ok(phone.get("/api/health"))
    access = ok(desk.post("/api/auth/sign-out-everywhere", json={"confirm": True}))
    assert access["urls"] == ["http://192.168.2.12:0", "http://desk.local:0"]
    ok(phone.get("/api/health"), 401)


def test_signing_out_forgets_this_phone(desk: TestClient, phone: TestClient) -> None:
    """The cookie is cleared."""
    pair(desk, phone)
    ok(phone.post("/api/auth/sign-out", json={"confirm": True}))
    ok(phone.get("/api/health"), 401)


def test_sessions_survive_a_restart(
    network_settings: Settings, clock: FixedClock, desk: TestClient, phone: TestClient
) -> None:
    """The key lives in the data folder, not in memory."""
    pair(desk, phone)
    token = phone.cookies[SESSION_COOKIE]
    restarted = create_app(network_settings, clock=clock)
    with TestClient(restarted, client=PHONE, base_url="http://192.168.2.12") as again:
        again.cookies.set(SESSION_COOKIE, token)
        ok(again.get("/api/health"))


def test_without_phone_access_nothing_changes(client: TestClient) -> None:
    """The guard is a no-op and pairing is refused."""
    assert ok(client.get("/api/auth/session")) == {
        "signed_in": True,
        "local": True,
        "phone_access": False,
    }
    assert ok(client.get("/api/auth/phones")) == {
        "enabled": False,
        "urls": [],
        "tls": False,
        "pairing": None,
    }
    ok(client.post("/api/auth/pairing", json={"confirm": True}), 409)


# --- preferences --------------------------------------------------------------


def test_the_theme_follows_every_device(desk: TestClient, phone: TestClient) -> None:
    """Set on one device, read on another."""
    assert ok(desk.get("/api/preferences")) == {"theme": None}
    assert ok(desk.patch("/api/preferences", json={"theme": "dark"})) == {"theme": "dark"}
    pair(desk, phone)
    assert ok(phone.get("/api/preferences")) == {"theme": "dark"}
    assert ok(phone.patch("/api/preferences", json={})) == {"theme": "dark"}
    ok(phone.patch("/api/preferences", json={"theme": "purple"}), 422)
