"""Phone access: pairing codes, signed session tokens, and who counts as local.

Requests from this PC (a loopback client) never need to sign in, as before.
Anything else, which can only arrive when phone access is on, needs a
session cookie. A phone gets one by typing a short pairing code that this
PC shows for ten minutes. Sessions are HMAC-signed with a key in the data
folder; replacing the key signs every phone out.
"""

import base64
import hashlib
import hmac
import ipaddress
import secrets
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path

from planbox.config import Settings
from planbox.core.clock import Clock
from planbox.core.errors import Conflict, Forbidden, Unauthorized


def is_loopback(host: str | None) -> bool:
    """Whether a client address is this PC (127.0.0.0/8, ::1, or IPv4-mapped loopback)."""
    if host is None:
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return ip.ipv4_mapped.is_loopback
    return ip.is_loopback


SESSION_COOKIE = "planbox_session"
SESSION_LIFETIME = timedelta(days=400)
"""How long a phone stays signed in (Chrome caps cookie lifetimes at 400 days)."""

PAIRING_LIFETIME = timedelta(minutes=10)
PAIRING_ATTEMPTS = 5
"""Wrong codes allowed before the current code is void."""

_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
"""No 0/O, 1/I/L: easy to read off a screen and type on a phone."""


@dataclass(slots=True)
class Pairing:
    """The pairing code currently shown on this PC.

    Attributes:
        code: Eight characters, shown as ``ABCD-EFGH``.
        expires_at: When it stops working.
        attempts_left: Wrong tries before it is void.
    """

    code: str
    expires_at: datetime
    attempts_left: int = PAIRING_ATTEMPTS


@dataclass(slots=True)
class AuthState:
    """In-memory state shared by every request (one per app).

    Attributes:
        lock: Guards the pairing and the cached key.
        pairing: The active pairing code, if any.
        key: The signing key, once read from disk.
    """

    lock: threading.Lock = field(default_factory=threading.Lock)
    pairing: Pairing | None = None
    key: bytes | None = None


def normalize_code(code: str) -> str:
    """Upper-case, without dashes or spaces, so ``abcd efgh`` matches ``ABCD-EFGH``."""
    return "".join(ch for ch in code.upper() if ch.isalnum())


def format_code(code: str) -> str:
    """``ABCDEFGH`` as ``ABCD-EFGH``."""
    return f"{code[:4]}-{code[4:]}"


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class AuthService:
    """Decides who may use the API and signs phones in."""

    def __init__(self, settings: Settings, clock: Clock, state: AuthState) -> None:
        self._settings = settings
        self._clock = clock
        self._state = state

    @property
    def enabled(self) -> bool:
        """Whether phone access is on (otherwise every client is this PC)."""
        return self._settings.network is not None

    def is_local(self, client_host: str | None) -> bool:
        """Whether a request comes from this PC itself."""
        return not self.enabled or is_loopback(client_host)

    def addresses(self) -> list[str]:
        """The URLs a phone can open (empty when phone access is off)."""
        network = self._settings.network
        if network is None:
            return []
        scheme = "https" if network.tls else "http"
        hosts = [network.address, *([network.hostname] if network.hostname else [])]
        return [f"{scheme}://{host}:{self._settings.port}" for host in hosts]

    def require_local(self, client_host: str | None) -> None:
        """Raises ``Forbidden`` unless the request comes from this PC."""
        if not self.is_local(client_host):
            raise Forbidden("Only the PC running PlanBox can do this.")

    def is_signed_in(self, client_host: str | None, token: str | None) -> bool:
        """Local clients always are; others need a valid session token."""
        return self.is_local(client_host) or (token is not None and self.verify(token))

    # --- pairing ----------------------------------------------------------------

    def start_pairing(self) -> Pairing:
        """Shows a new code (the previous one stops working).

        Raises:
            Conflict: If phone access is off, so no phone could use it.
        """
        if not self.enabled:
            raise Conflict("Phone access is off. Set network = true in settings.toml first.")
        code = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
        pairing = Pairing(code, self._clock.now() + PAIRING_LIFETIME)
        with self._state.lock:
            self._state.pairing = pairing
        return pairing

    def current_pairing(self) -> Pairing | None:
        """The code still waiting to be typed in, if any."""
        with self._state.lock:
            pairing = self._state.pairing
            if pairing is not None and pairing.expires_at <= self._clock.now():
                self._state.pairing = pairing = None
            return pairing

    def sign_in(self, code: str) -> str:
        """Trades the current pairing code for a session token. The code works once.

        Raises:
            Unauthorized: If no code is active, it expired, or it does not match.
        """
        typed = normalize_code(code)
        with self._state.lock:
            pairing = self._state.pairing
            if pairing is None or pairing.expires_at <= self._clock.now():
                self._state.pairing = None
                raise Unauthorized("No pairing code is active. Show a new one on the PC.")
            if not hmac.compare_digest(typed, pairing.code):
                pairing.attempts_left -= 1
                if pairing.attempts_left <= 0:
                    self._state.pairing = None
                    raise Unauthorized("Too many wrong codes. Show a new one on the PC.")
                raise Unauthorized("That code is not right.")
            self._state.pairing = None
        return self._issue()

    # --- sessions ---------------------------------------------------------------

    def _issue(self) -> str:
        issued = int(self._clock.now().timestamp() * 1000)
        payload = f"{issued}.{secrets.token_hex(12)}"
        return f"{payload}.{self._sign(payload)}"

    def verify(self, token: str) -> bool:
        """Whether a session token was signed with the current key and is not too old."""
        issued, _, rest = token.partition(".")
        nonce, _, signature = rest.partition(".")
        if not (issued and nonce and signature):
            return False
        if not hmac.compare_digest(signature, self._sign(f"{issued}.{nonce}")):
            return False
        if not issued.isdigit():
            return False
        issued_at = datetime.fromtimestamp(int(issued) / 1000, tz=UTC)
        return issued_at + SESSION_LIFETIME > self._clock.now()

    def sign_out_everywhere(self) -> None:
        """Replaces the signing key: every phone has to pair again."""
        with self._state.lock:
            self._state.key = self._write_key()

    def _sign(self, payload: str) -> str:
        digest = hmac.new(self._key(), payload.encode("utf-8"), hashlib.sha256).digest()
        return _b64(digest)

    def _key(self) -> bytes:
        with self._state.lock:
            if self._state.key is None:
                path = self._key_path
                if path.is_file():
                    self._state.key = bytes.fromhex(path.read_text(encoding="ascii").strip())
                else:
                    self._state.key = self._write_key()
            return self._state.key

    def _write_key(self) -> bytes:
        key = secrets.token_bytes(32)
        path = self._key_path
        path.parent.mkdir(parents=True, exist_ok=True)
        partial = path.with_suffix(".partial")
        partial.write_text(key.hex(), encoding="ascii")
        partial.replace(path)
        return key

    @property
    def _key_path(self) -> Path:
        return self._settings.data_dir / "network.key"
