"""Google's OAuth and Drive REST endpoints, over a replaceable HTTP transport.

Only the standard library is used: three OAuth calls and four Drive calls do
not justify a Google client package. Tests swap the transport for a fake
Google (``tests/fake_google.py``).

Drive access is limited to the ``drive.appdata`` scope: a hidden folder only
PlanBox can see, which Google counts as a non-sensitive scope.
"""

import base64
import contextlib
import hashlib
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import cast

from planbox.core.errors import Conflict, UpstreamFailed

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - an endpoint, not a secret
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
FILES_URL = "https://www.googleapis.com/drive/v3/files"
UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"
SCOPE = "https://www.googleapis.com/auth/drive.appdata"
TIMEOUT_SECONDS = 60


@dataclass(frozen=True, slots=True)
class HttpRequest:
    """One HTTP request to Google."""

    method: str
    url: str
    headers: Mapping[str, str] = field(default_factory=dict[str, str])
    body: bytes | None = None


@dataclass(frozen=True, slots=True)
class HttpResponse:
    """Google's answer; header names are lower-case."""

    status: int
    headers: Mapping[str, str]
    body: bytes

    def json(self) -> dict[str, object]:
        """The body as a JSON object (empty when it is not one)."""
        try:
            value: object = json.loads(self.body or b"{}")
        except ValueError:
            return {}
        return value if isinstance(value, dict) else {}  # pyright: ignore[reportUnknownVariableType]


type Transport = Callable[[HttpRequest], HttpResponse]
"""Sends a request; raises ``UpstreamFailed`` when Google cannot be reached."""


def urllib_transport(request: HttpRequest) -> HttpResponse:
    """The real transport (HTTPS to Google's fixed endpoints only)."""
    if not request.url.startswith("https://"):
        raise ValueError(f"not an https URL: {request.url}")
    raw = urllib.request.Request(  # noqa: S310 - https to Google, checked above
        request.url, data=request.body, method=request.method, headers=dict(request.headers)
    )
    try:
        with urllib.request.urlopen(raw, timeout=TIMEOUT_SECONDS) as answer:  # noqa: S310
            return HttpResponse(
                answer.status, {k.lower(): v for k, v in answer.headers.items()}, answer.read()
            )
    except urllib.error.HTTPError as exc:
        return HttpResponse(exc.code, {k.lower(): v for k, v in exc.headers.items()}, exc.read())
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        reason = getattr(exc, "reason", exc)
        raise UpstreamFailed(f"Google could not be reached ({reason}).") from exc


# ------------------------------------------------------------------- OAuth


@dataclass(frozen=True, slots=True)
class OAuthClient:
    """An OAuth client of type "Desktop app" from the owner's Google Cloud project."""

    client_id: str
    client_secret: str


@dataclass(frozen=True, slots=True)
class AccessToken:
    """A short-lived access token and when it expires."""

    value: str
    expires_at: datetime


class SignedOut(Conflict):
    """Google no longer accepts the stored sign-in (revoked or expired)."""


def pkce_pair() -> tuple[str, str]:
    """A PKCE code verifier and its S256 challenge (RFC 7636)."""
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def authorization_url(client: OAuthClient, redirect_uri: str, state: str, challenge: str) -> str:
    """Where the browser signs in and allows access to the app data folder."""
    query = urllib.parse.urlencode(
        {
            "client_id": client.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    return f"{AUTH_URL}?{query}"


def _form(values: Mapping[str, str]) -> tuple[dict[str, str], bytes]:
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    return headers, urllib.parse.urlencode(values).encode("ascii")


def _token(answer: HttpResponse, now: datetime) -> AccessToken:
    data = answer.json()
    value, lifetime = data.get("access_token"), data.get("expires_in", 3600)
    if not isinstance(value, str) or not isinstance(lifetime, int):
        raise UpstreamFailed("Google sent an access token PlanBox cannot read.")
    # Renew a minute early, so a token never runs out in the middle of a sync.
    return AccessToken(value, now + timedelta(seconds=max(lifetime - 60, 0)))


def exchange_code(
    transport: Transport,
    client: OAuthClient,
    *,
    code: str,
    verifier: str,
    redirect_uri: str,
    now: datetime,
) -> tuple[AccessToken, str]:
    """Trades the code from the browser for an access and a refresh token.

    Raises:
        UpstreamFailed: If Google refuses the code.
    """
    headers, body = _form(
        {
            "client_id": client.client_id,
            "client_secret": client.client_secret,
            "code": code,
            "code_verifier": verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
    )
    answer = transport(HttpRequest("POST", TOKEN_URL, headers, body))
    if answer.status != 200:  # noqa: PLR2004
        raise UpstreamFailed(f"Google did not accept the sign-in ({_error(answer)}).")
    refresh = answer.json().get("refresh_token")
    if not isinstance(refresh, str):
        raise UpstreamFailed("Google sent no refresh token; sign in again.")
    return _token(answer, now), refresh


def refresh_access(
    transport: Transport, client: OAuthClient, refresh_token: str, now: datetime
) -> AccessToken:
    """A new access token from the stored refresh token.

    Raises:
        SignedOut: If Google no longer accepts the refresh token.
        UpstreamFailed: For any other failure.
    """
    headers, body = _form(
        {
            "client_id": client.client_id,
            "client_secret": client.client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        }
    )
    answer = transport(HttpRequest("POST", TOKEN_URL, headers, body))
    if answer.status in {400, 401} and answer.json().get("error") == "invalid_grant":
        raise SignedOut("Google Drive signed PlanBox out. Connect again.")
    if answer.status != 200:  # noqa: PLR2004
        raise UpstreamFailed(f"Google did not renew access ({_error(answer)}).")
    return _token(answer, now)


def revoke(transport: Transport, token: str) -> None:
    """Withdraws PlanBox's access (best effort: a failure changes nothing here)."""
    headers, body = _form({"token": token})
    with contextlib.suppress(UpstreamFailed):
        transport(HttpRequest("POST", REVOKE_URL, headers, body))


def _error(answer: HttpResponse) -> str:
    data = answer.json()
    error = data.get("error")
    if isinstance(error, dict):
        message = error.get("message")  # pyright: ignore[reportUnknownMemberType, reportUnknownVariableType]
        return str(message) if message else f"HTTP {answer.status}"  # pyright: ignore[reportUnknownArgumentType]
    description = data.get("error_description")
    return str(description or error or f"HTTP {answer.status}")


# ------------------------------------------------------------------- Drive


@dataclass(frozen=True, slots=True)
class DriveFile:
    """A file in the app data folder."""

    id: str
    name: str
    modified_time: str
    size: int
    properties: Mapping[str, str]


class Drive:
    """The app data folder of the signed-in Google account."""

    def __init__(self, transport: Transport, token: str) -> None:
        self._transport = transport
        self._token = token

    def _send(
        self, method: str, url: str, body: bytes | None = None, headers: Mapping[str, str] = {}
    ) -> HttpResponse:
        answer = self._transport(
            HttpRequest(method, url, {"Authorization": f"Bearer {self._token}", **headers}, body)
        )
        if answer.status == 401:  # noqa: PLR2004
            raise SignedOut("Google Drive signed PlanBox out. Connect again.")
        if answer.status >= 300:  # noqa: PLR2004
            raise UpstreamFailed(f"Google Drive refused the request ({_error(answer)}).")
        return answer

    def list(self, prefix: str) -> list[DriveFile]:
        """Files whose name starts with ``prefix``."""
        found: list[DriveFile] = []
        page: str | None = None
        while True:
            query = {
                "spaces": "appDataFolder",
                "q": f"name contains '{prefix}' and trashed = false",
                "fields": "nextPageToken,files(id,name,modifiedTime,size,appProperties)",
                "pageSize": "100",
                **({"pageToken": page} if page else {}),
            }
            data = self._send("GET", f"{FILES_URL}?{urllib.parse.urlencode(query)}").json()
            files = data.get("files", [])
            for item in files if isinstance(files, list) else []:  # pyright: ignore[reportUnknownVariableType]
                if isinstance(item, dict):
                    parsed = _drive_file(item)  # pyright: ignore[reportUnknownArgumentType]
                    if parsed is not None and parsed.name.startswith(prefix):
                        found.append(parsed)
            token = data.get("nextPageToken")
            if not isinstance(token, str):
                return found
            page = token

    def download(self, file_id: str) -> bytes:
        """A file's content."""
        return self._send("GET", f"{FILES_URL}/{urllib.parse.quote(file_id)}?alt=media").body

    def upload(
        self, name: str, content: bytes, properties: Mapping[str, str], existing: str | None
    ) -> DriveFile:
        """Creates the file, or replaces the content of ``existing`` (resumable upload).

        A resumable upload has no size limit, unlike a simple one (5 MB).
        """
        metadata: dict[str, object] = {"appProperties": dict(properties)}
        if existing is None:
            metadata |= {"name": name, "parents": ["appDataFolder"]}
            method, url = "POST", UPLOAD_URL
        else:
            method, url = "PATCH", f"{UPLOAD_URL}/{urllib.parse.quote(existing)}"
        fields = "id,name,modifiedTime,size,appProperties"
        start = self._send(
            method,
            f"{url}?uploadType=resumable&fields={fields}",
            json.dumps(metadata).encode("utf-8"),
            {
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": "application/gzip",
                "X-Upload-Content-Length": str(len(content)),
            },
        )
        session = start.headers.get("location")
        if not session:
            raise UpstreamFailed("Google Drive did not start the upload.")
        done = self._send("PUT", session, content, {"Content-Type": "application/gzip"})
        parsed = _drive_file(done.json())
        if parsed is None:
            raise UpstreamFailed("Google Drive did not confirm the upload.")
        return parsed


def _drive_file(item: Mapping[str, object]) -> DriveFile | None:
    file_id, name, modified = item.get("id"), item.get("name"), item.get("modifiedTime")
    if not (isinstance(file_id, str) and isinstance(name, str) and isinstance(modified, str)):
        return None
    raw_size = item.get("size", "0")
    props = item.get("appProperties", {})
    properties = (
        {str(k): str(v) for k, v in cast("dict[object, object]", props).items()}
        if isinstance(props, dict)
        else {}
    )
    size = int(raw_size) if isinstance(raw_size, str | int) and str(raw_size).isdigit() else 0
    return DriveFile(file_id, name, modified, size, properties)
