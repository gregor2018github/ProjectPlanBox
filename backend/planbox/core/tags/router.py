"""HTTP routes for tags."""

from fastapi import APIRouter, Response, status

from planbox.core.tags.deps import TagServiceDep
from planbox.core.tags.models import Tag
from planbox.core.tags.schemas import TagCreate, TagDeletedOut, TagOut, TagPatch

router = APIRouter(prefix="/tags", tags=["core"])


def _out(tag: Tag) -> TagOut:
    return TagOut.model_validate(tag, from_attributes=True)


@router.get("")
def list_tags(service: TagServiceDep) -> list[TagOut]:
    """All live tags, alphabetically."""
    return [_out(t) for t in service.list_live()]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_tag(body: TagCreate, service: TagServiceDep, response: Response) -> TagOut:
    """Creates a tag (idempotent per client id)."""
    tag, created = service.create(body.name, body.id)
    if not created:
        response.status_code = status.HTTP_200_OK
    return _out(tag)


@router.patch("/{tag_id}")
def rename_tag(tag_id: str, body: TagPatch, service: TagServiceDep) -> TagOut:
    """Renames a tag."""
    return _out(service.rename(tag_id, body.name))


@router.delete("/{tag_id}")
def delete_tag(tag_id: str, service: TagServiceDep) -> TagDeletedOut:
    """Deletes a tag and detaches it everywhere (undo with restore)."""
    return TagDeletedOut(id=tag_id, deleted_at=service.delete(tag_id))


@router.post("/{tag_id}/restore")
def restore_tag(tag_id: str, service: TagServiceDep) -> TagOut:
    """Undoes a delete."""
    return _out(service.restore(tag_id))
