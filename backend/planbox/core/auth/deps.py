"""FastAPI dependencies for phone access."""

from typing import Annotated, cast

from fastapi import Depends, FastAPI, Request
from starlette.types import ASGIApp

from planbox.config import Settings
from planbox.core.auth.service import AuthService, AuthState
from planbox.core.clock import Clock


def auth_service_for(app: ASGIApp) -> AuthService:
    """Builds the auth service from an app's state (also used by the middleware)."""
    state = cast("FastAPI", app).state
    return AuthService(
        cast("Settings", state.settings), cast("Clock", state.clock), cast("AuthState", state.auth)
    )


def get_auth_service(request: Request) -> AuthService:
    """The auth service of the request's app."""
    return auth_service_for(request.app)


def get_client_host(request: Request) -> str | None:
    """The address the request came from."""
    return None if request.client is None else request.client.host


AuthDep = Annotated[AuthService, Depends(get_auth_service)]
ClientHostDep = Annotated[str | None, Depends(get_client_host)]
