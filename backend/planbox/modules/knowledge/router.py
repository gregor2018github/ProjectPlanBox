"""HTTP routes for the knowledge module, mounted at ``/api/knowledge``."""

import json
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import FileResponse

from planbox.core.db.deps import ClockDep, ConnectionDep, SettingsDep
from planbox.core.tags.deps import TagServiceDep
from planbox.modules.knowledge.images import ImageStore
from planbox.modules.knowledge.models import Collection, Deletion, EntryRecord
from planbox.modules.knowledge.schemas import (
    CollectionCreate,
    CollectionMove,
    CollectionOut,
    CollectionRename,
    EntryCreate,
    EntryOut,
    EntryPatch,
    ImageOut,
    ImageUpload,
    KnowledgeDeletedOut,
    PageContent,
)
from planbox.modules.knowledge.service import (
    CollectionService,
    EntryService,
    NewEntry,
    Repositories,
)

router = APIRouter()


def _collections(conn: ConnectionDep, clock: ClockDep) -> CollectionService:
    return CollectionService(conn, Repositories.on(conn), clock)


def _entries(conn: ConnectionDep, clock: ClockDep, tags: TagServiceDep) -> EntryService:
    return EntryService(conn, Repositories.on(conn), tags, clock)


def _images(settings: SettingsDep) -> ImageStore:
    return ImageStore(settings.data_dir / "images")


Collections = Annotated[CollectionService, Depends(_collections)]
Entries = Annotated[EntryService, Depends(_entries)]
Images = Annotated[ImageStore, Depends(_images)]


def _collection(collection: Collection) -> CollectionOut:
    return CollectionOut.model_validate(collection, from_attributes=True)


def _entry(record: EntryRecord) -> EntryOut:
    e = record.entry
    return EntryOut(
        id=e.id,
        collection_id=e.collection_id,
        title=e.title,
        content=PageContent.model_validate(json.loads(e.content)),
        body=e.body,
        created_at=e.created_at,
        updated_at=e.updated_at,
        tag_ids=record.tag_ids,
    )


def _deleted(deletion: Deletion) -> KnowledgeDeletedOut:
    return KnowledgeDeletedOut.model_validate(deletion, from_attributes=True)


def _created(response: Response, created: bool) -> None:
    if not created:
        response.status_code = status.HTTP_200_OK


# -------------------------------------------------------------- collections


@router.get("/collections")
def list_collections(service: Collections) -> list[CollectionOut]:
    """All live collections in order."""
    return [_collection(c) for c in service.list_live()]


@router.post("/collections", status_code=status.HTTP_201_CREATED)
def create_collection(
    body: CollectionCreate, service: Collections, response: Response
) -> CollectionOut:
    """Creates a collection at the end (idempotent per client id)."""
    collection, created = service.create(body.name, body.id)
    _created(response, created)
    return _collection(collection)


@router.patch("/collections/{collection_id}")
def rename_collection(
    collection_id: str, body: CollectionRename, service: Collections
) -> CollectionOut:
    """Renames a collection."""
    return _collection(service.rename(collection_id, body.name))


@router.post("/collections/{collection_id}/move")
def move_collection(
    collection_id: str, body: CollectionMove, service: Collections
) -> CollectionOut:
    """Reorders a collection."""
    return _collection(service.move(collection_id, body.before_id, body.after_id))


@router.delete("/collections/{collection_id}")
def delete_collection(collection_id: str, service: Collections) -> KnowledgeDeletedOut:
    """Deletes a collection with its entries (undo with restore)."""
    return _deleted(service.delete(collection_id))


@router.post("/collections/{collection_id}/restore")
def restore_collection(collection_id: str, service: Collections) -> KnowledgeDeletedOut:
    """Undoes a collection delete."""
    return _deleted(service.restore(collection_id))


# ------------------------------------------------------------------ entries


@router.get("/entries")
def list_entries(service: Entries) -> list[EntryOut]:
    """Every live entry, most recently changed first."""
    return [_entry(r) for r in service.list_live()]


@router.post("/entries", status_code=status.HTTP_201_CREATED)
def create_entry(body: EntryCreate, service: Entries, response: Response) -> EntryOut:
    """Creates a page (idempotent per client id)."""
    record, created = service.create(
        NewEntry(
            id=body.id,
            collection_id=body.collection_id,
            title=body.title,
            content=body.content.model_dump(),
            tag_ids=body.tag_ids,
        )
    )
    _created(response, created)
    return _entry(record)


@router.patch("/entries/{entry_id}")
def update_entry(entry_id: str, body: EntryPatch, service: Entries) -> EntryOut:
    """Changes the fields present in the body."""
    changes = {name: getattr(body, name) for name in body.model_fields_set}
    if body.content is not None:
        changes["content"] = body.content.model_dump()
    return _entry(service.update(entry_id, changes))


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: str, service: Entries) -> KnowledgeDeletedOut:
    """Deletes an entry (undo with restore)."""
    return _deleted(service.delete(entry_id))


@router.post("/entries/{entry_id}/restore")
def restore_entry(entry_id: str, service: Entries) -> EntryOut:
    """Undoes a delete."""
    return _entry(service.restore(entry_id))


# ------------------------------------------------------------------- images


@router.post("/images", status_code=status.HTTP_201_CREATED)
def upload_image(body: ImageUpload, images: Images) -> ImageOut:
    """Saves an image for a page, on this PC only (it does not sync)."""
    return ImageOut(url=images.save(body.data, body.type))


# Not in the OpenAPI schema: it answers with the file, not JSON, and the
# phone app has no images to serve.
@router.get("/images/{name}", include_in_schema=False)
def get_image(name: str, images: Images) -> FileResponse:
    """Serves a saved image; its name never changes, so it may be cached forever."""
    image = images.find(name)
    return FileResponse(
        image.path,
        media_type=image.media_type,
        headers={
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
