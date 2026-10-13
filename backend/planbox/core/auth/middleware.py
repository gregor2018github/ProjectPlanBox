"""Keeps the API closed to devices that have not paired (phone access only)."""

from starlette.requests import Request
from starlette.types import ASGIApp, Receive, Scope, Send

from planbox.core.auth.deps import auth_service_for
from planbox.core.auth.service import SESSION_COOKIE
from planbox.core.errors import Problem, problem_response

PUBLIC_API = frozenset({"/api/auth/session", "/api/auth/sign-in"})
"""What an unpaired phone may call: enough to show the sign-in screen and sign in."""


class SessionGuard:
    """Answers 401 to API calls from non-local clients without a valid session.

    Pages and static files stay public: the app shell holds no data, and it
    has to load to show the sign-in screen. With phone access off, every
    client is local and this passes everything through.
    """

    def __init__(self, app: ASGIApp) -> None:
        self._app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """Checks the session of API requests."""
        path = str(scope.get("path", ""))
        if scope["type"] != "http" or not path.startswith("/api/") or path in PUBLIC_API:
            await self._app(scope, receive, send)
            return
        request = Request(scope)
        auth = auth_service_for(request.app)
        client = None if request.client is None else request.client.host
        if auth.is_signed_in(client, request.cookies.get(SESSION_COOKIE)):
            await self._app(scope, receive, send)
            return
        response = problem_response(
            Problem(
                title="Not signed in",
                status=401,
                detail="Pair this device with a code from the PC running PlanBox.",
                code="unauthorized",
            )
        )
        await response(scope, receive, send)
