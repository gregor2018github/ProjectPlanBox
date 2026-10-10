"""HTTP routes for links."""

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from planbox.core.links.deps import LinkServiceDep
from planbox.core.links.models import LinkEnd, LinkView
from planbox.core.links.schemas import LinkCreate, LinkDeletedOut, LinkEndOut, LinkOut
from planbox.core.links.service import parse_ref

router = APIRouter(prefix="/links", tags=["core"])


def _end(end: LinkEnd) -> LinkEndOut:
    return LinkEndOut(ref=str(end.ref), title=end.title, deleted=end.deleted)


def _out(view: LinkView) -> LinkOut:
    return LinkOut(
        id=view.id, source=_end(view.source), target=_end(view.target), created_at=view.created_at
    )


@router.get("")
def list_links(
    service: LinkServiceDep,
    entity: Annotated[str, Query(description="Entity reference, e.g. 'todos.todo:<id>'.")],
) -> list[LinkOut]:
    """Live links from and to one entity, oldest first."""
    return [_out(v) for v in service.links_of(parse_ref(entity))]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_link(body: LinkCreate, service: LinkServiceDep, response: Response) -> LinkOut:
    """Links two entities (idempotent per client id)."""
    view, created = service.create(parse_ref(body.source), parse_ref(body.target), body.id)
    if not created:
        response.status_code = status.HTTP_200_OK
    return _out(view)


@router.delete("/{link_id}")
def delete_link(link_id: str, service: LinkServiceDep) -> LinkDeletedOut:
    """Removes a link (undo with restore)."""
    return LinkDeletedOut(id=link_id, deleted_at=service.delete(link_id))


@router.post("/{link_id}/restore")
def restore_link(link_id: str, service: LinkServiceDep) -> LinkOut:
    """Undoes a delete."""
    return _out(service.restore(link_id))
