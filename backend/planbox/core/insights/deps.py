"""FastAPI dependency for the insights service."""

from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import Depends

from planbox.core.db.deps import ClockDep, ConnectionDep, SettingsDep
from planbox.core.entities import EntityRegistry
from planbox.core.insights.repository import AppOpenRepository
from planbox.core.insights.service import InsightsService
from planbox.core.links.deps import get_entity_registry


def get_insights_service(
    conn: ConnectionDep,
    clock: ClockDep,
    settings: SettingsDep,
    registry: Annotated[EntityRegistry, Depends(get_entity_registry)],
) -> InsightsService:
    """Builds an insights service on the request's connection."""
    return InsightsService(
        conn, AppOpenRepository(conn), registry, clock, ZoneInfo(settings.timezone)
    )


InsightsServiceDep = Annotated[InsightsService, Depends(get_insights_service)]
