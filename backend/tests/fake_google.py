"""A fake Google (OAuth token endpoint and Drive's app data folder) for sync tests."""

import json
import urllib.parse
from dataclasses import dataclass, field

from planbox.core.cloud.google import (
    FILES_URL,
    REVOKE_URL,
    TOKEN_URL,
    UPLOAD_URL,
    HttpRequest,
    HttpResponse,
)


@dataclass
class FakeFile:
    """A file in the fake app data folder."""

    id: str
    name: str
    content: bytes
    properties: dict[str, str]
    modified: str


@dataclass
class FakeGoogle:
    """Answers the requests PlanBox sends to Google, from memory.

    Attributes:
        files: The app data folder, by file id.
        valid_codes: Authorization codes the token endpoint accepts.
        refresh_tokens: Refresh tokens Google still honours.
        revoked: Tokens PlanBox revoked.
        offline: When true, every request fails as if the network were down.
    """

    files: dict[str, FakeFile] = field(default_factory=dict[str, FakeFile])
    valid_codes: set[str] = field(default_factory=lambda: {"good-code"})
    refresh_tokens: set[str] = field(default_factory=set[str])
    revoked: list[str] = field(default_factory=list[str])
    offline: bool = False
    _sessions: dict[str, tuple[str | None, dict[str, object]]] = field(
        default_factory=dict[str, tuple[str | None, dict[str, object]]]
    )
    _counter: int = 0
    _tick: int = 0

    def _next(self, prefix: str) -> str:
        self._counter += 1
        return f"{prefix}{self._counter}"

    def _now(self) -> str:
        self._tick += 1
        return f"2026-10-08T12:{self._tick // 60:02d}:{self._tick % 60:02d}.000Z"

    def __call__(self, request: HttpRequest) -> HttpResponse:  # noqa: PLR0911 - one per endpoint
        """The transport PlanBox calls."""
        from planbox.core.errors import UpstreamFailed  # noqa: PLC0415

        if self.offline:
            raise UpstreamFailed("Google could not be reached (offline).")
        url, _, query_text = request.url.partition("?")
        query = dict(urllib.parse.parse_qsl(query_text))
        if url == TOKEN_URL:
            return self._token(request)
        if url == REVOKE_URL:
            form = dict(urllib.parse.parse_qsl((request.body or b"").decode()))
            self.revoked.append(form["token"])
            self.refresh_tokens.discard(form["token"])
            return _json(200, {})
        if request.headers.get("Authorization") != "Bearer access-1" and not url.startswith(
            "https://upload.session/"
        ):
            return _json(401, {"error": {"message": "Invalid Credentials"}})
        if url == FILES_URL and request.method == "GET":
            return self._list(query)
        if url.startswith(UPLOAD_URL):
            return self._start_upload(request, url)
        if url.startswith("https://upload.session/"):
            return self._finish_upload(request, url)
        if url.startswith(FILES_URL + "/") and query.get("alt") == "media":
            file = self.files.get(url.rsplit("/", 1)[1])
            return _json(404, {}) if file is None else HttpResponse(200, {}, file.content)
        return _json(404, {"error": {"message": f"unexpected {request.method} {url}"}})

    def _token(self, request: HttpRequest) -> HttpResponse:
        form = dict(urllib.parse.parse_qsl((request.body or b"").decode()))
        if form.get("grant_type") == "authorization_code":
            if form.get("code") not in self.valid_codes or not form.get("code_verifier"):
                return _json(400, {"error": "invalid_grant"})
            refresh = self._next("refresh-")
            self.refresh_tokens.add(refresh)
            return _json(
                200, {"access_token": "access-1", "expires_in": 3599, "refresh_token": refresh}
            )
        if form.get("refresh_token") in self.refresh_tokens:
            return _json(200, {"access_token": "access-1", "expires_in": 3599})
        return _json(400, {"error": "invalid_grant"})

    def _list(self, query: dict[str, str]) -> HttpResponse:
        assert query["spaces"] == "appDataFolder"
        needle = query["q"].split("'")[1]
        return _json(
            200,
            {
                "files": [
                    {
                        "id": f.id,
                        "name": f.name,
                        "modifiedTime": f.modified,
                        "size": str(len(f.content)),
                        "appProperties": f.properties,
                    }
                    for f in self.files.values()
                    if needle in f.name
                ]
            },
        )

    def _start_upload(self, request: HttpRequest, url: str) -> HttpResponse:
        metadata: dict[str, object] = json.loads(request.body or b"{}")
        existing = None if request.method == "POST" else url.rsplit("/", 1)[1]
        if existing is None:
            assert metadata["parents"] == ["appDataFolder"]
        session = self._next("https://upload.session/")
        self._sessions[session] = (existing, metadata)
        return HttpResponse(200, {"location": session}, b"")

    def _finish_upload(self, request: HttpRequest, url: str) -> HttpResponse:
        existing, metadata = self._sessions.pop(url)
        props = metadata.get("appProperties")
        properties = {str(k): str(v) for k, v in props.items()} if isinstance(props, dict) else {}
        content = request.body or b""
        if existing is None:
            file = FakeFile(
                self._next("file-"), str(metadata["name"]), content, properties, self._now()
            )
            self.files[file.id] = file
        else:
            file = self.files[existing]
            file.content, file.properties, file.modified = content, properties, self._now()
        return _json(
            200,
            {
                "id": file.id,
                "name": file.name,
                "modifiedTime": file.modified,
                "size": str(len(file.content)),
                "appProperties": file.properties,
            },
        )


def _json(status: int, data: object) -> HttpResponse:
    return HttpResponse(status, {"content-type": "application/json"}, json.dumps(data).encode())
