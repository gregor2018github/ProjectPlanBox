"""FastAPI dependency for the search service."""

from typing import Annotated

from fastapi import Depends

from planbox.core.db.deps import ClockDep, ConnectionDep
from planbox.core.entities import EntityRegistry
from planbox.core.links.deps import get_entity_registry
from planbox.core.search.repository import SearchRepository
from planbox.core.search.service import SearchService


def get_search_service(
    conn: ConnectionDep,
    clock: ClockDep,
    registry: Annotated[EntityRegistry, Depends(get_entity_registry)],
) -> SearchService:
    """Builds a search service on the request's connection."""
    return SearchService(conn, SearchRepository(conn), registry, clock)


SearchServiceDep = Annotated[SearchService, Depends(get_search_service)]
