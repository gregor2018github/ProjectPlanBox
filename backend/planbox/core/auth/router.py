"""HTTP routes for phone access: signing in, and pairing from this PC."""

from fastapi import APIRouter, Request, Response

from planbox.core.auth.deps import AuthDep, ClientHostDep
from planbox.core.auth.schemas import Confirm, PairingOut, PhoneAccessOut, SessionOut, SignIn
from planbox.core.auth.service import (
    SESSION_COOKIE,
    SESSION_LIFETIME,
    AuthService,
    Pairing,
    format_code,
)
from planbox.core.clock import to_iso

router = APIRouter(prefix="/auth", tags=["core"])


def _pairing_out(pairing: Pairing) -> PairingOut:
    return PairingOut(code=format_code(pairing.code), expires_at=to_iso(pairing.expires_at))


def _phone_access(auth: AuthService) -> PhoneAccessOut:
    pairing = auth.current_pairing()
    return PhoneAccessOut(
        enabled=auth.enabled,
        urls=auth.addresses(),
        tls=any(url.startswith("https:") for url in auth.addresses()),
        pairing=None if pairing is None else _pairing_out(pairing),
    )


@router.get("/session")
def get_session(auth: AuthDep, client: ClientHostDep, request: Request) -> SessionOut:
    """Whether this device is signed in (always true on this PC)."""
    return SessionOut(
        signed_in=auth.is_signed_in(client, request.cookies.get(SESSION_COOKIE)),
        local=auth.is_local(client),
        phone_access=auth.enabled,
    )


@router.post("/sign-in")
def sign_in(
    body: SignIn, auth: AuthDep, client: ClientHostDep, request: Request, response: Response
) -> SessionOut:
    """Trades a pairing code for a session cookie that lasts 400 days."""
    token = auth.sign_in(body.code)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_LIFETIME.total_seconds()),
        httponly=True,
        samesite="strict",
        secure=request.url.scheme == "https",
    )
    return SessionOut(signed_in=True, local=auth.is_local(client), phone_access=auth.enabled)


@router.post("/sign-out")
def sign_out(_: Confirm, auth: AuthDep, client: ClientHostDep, response: Response) -> SessionOut:
    """Forgets this device's session."""
    response.delete_cookie(SESSION_COOKIE, httponly=True, samesite="strict")
    local = auth.is_local(client)
    return SessionOut(signed_in=local, local=local, phone_access=auth.enabled)


@router.get("/phones")
def get_phone_access(auth: AuthDep, client: ClientHostDep) -> PhoneAccessOut:
    """Phone access settings and the current pairing code (this PC only)."""
    auth.require_local(client)
    return _phone_access(auth)


@router.post("/pairing", status_code=201)
def start_pairing(_: Confirm, auth: AuthDep, client: ClientHostDep) -> PairingOut:
    """Shows a new pairing code, valid for ten minutes and one phone (this PC only)."""
    auth.require_local(client)
    return _pairing_out(auth.start_pairing())


@router.post("/sign-out-everywhere")
def sign_out_everywhere(_: Confirm, auth: AuthDep, client: ClientHostDep) -> PhoneAccessOut:
    """Signs every phone out; each has to pair again (this PC only)."""
    auth.require_local(client)
    auth.sign_out_everywhere()
    return _phone_access(auth)
