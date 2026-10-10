"""FastAPI dependencies for links."""

from typing import Annotated, cast

from fastapi import Depends, Request

from planbox.core.db.deps import ClockDep, ConnectionDep
from planbox.core.entities import EntityRegistry
from planbox.core.links.repository import LinkRepository
from planbox.core.links.service import LinkService


def get_entity_registry(request: Request) -> EntityRegistry:
    """Returns the entity types of the enabled modules."""
    return cast("EntityRegistry", request.app.state.entity_registry)


def get_link_service(
    conn: ConnectionDep,
    clock: ClockDep,
    registry: Annotated[EntityRegistry, Depends(get_entity_registry)],
) -> LinkService:
    """Builds a link service on the request's connection."""
    return LinkService(conn, LinkRepository(conn), registry, clock)


LinkServiceDep = Annotated[LinkService, Depends(get_link_service)]
