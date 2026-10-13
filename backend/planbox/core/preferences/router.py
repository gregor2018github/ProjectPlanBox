"""HTTP routes for preferences."""

from typing import Annotated

from fastapi import APIRouter, Depends

from planbox.core.db.deps import ClockDep, ConnectionDep
from planbox.core.preferences.repository import PreferenceRepository
from planbox.core.preferences.schemas import PreferencesOut, PreferencesPatch
from planbox.core.preferences.service import PreferenceService

router = APIRouter(prefix="/preferences", tags=["core"])


def _service(conn: ConnectionDep, clock: ClockDep) -> PreferenceService:
    return PreferenceService(conn, PreferenceRepository(conn), clock)


ServiceDep = Annotated[PreferenceService, Depends(_service)]


@router.get("")
def get_preferences(service: ServiceDep) -> PreferencesOut:
    """Preferences shared by every device."""
    return PreferencesOut(theme=service.get().theme)


@router.patch("")
def patch_preferences(body: PreferencesPatch, service: ServiceDep) -> PreferencesOut:
    """Changes preferences for every device."""
    prefs = service.get() if body.theme is None else service.set_theme(body.theme)
    return PreferencesOut(theme=prefs.theme)
