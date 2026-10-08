"""HTTP routes for health and metadata."""

from typing import Annotated

from fastapi import APIRouter, Depends

from planbox.core.db.deps import ConnectionDep, SettingsDep
from planbox.core.meta.repository import MetaRepository
from planbox.core.meta.schemas import HealthOut, MetaOut
from planbox.core.meta.service import MetaService

router = APIRouter(tags=["core"])


def _service(conn: ConnectionDep, settings: SettingsDep) -> MetaService:
    return MetaService(MetaRepository(conn), settings)


ServiceDep = Annotated[MetaService, Depends(_service)]


@router.get("/health")
def get_health(service: ServiceDep) -> HealthOut:
    """Reports liveness and the applied schema versions."""
    health = service.health()
    return HealthOut.model_validate(health, from_attributes=True)


@router.get("/meta")
def get_meta(service: ServiceDep) -> MetaOut:
    """Returns the app version, mode, timezone and week start."""
    meta = service.meta()
    return MetaOut.model_validate(meta, from_attributes=True)
