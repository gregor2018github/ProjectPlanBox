"""Tag use cases, including attaching tags to other modules' entities."""

import re
import sqlite3
from collections.abc import Sequence

from planbox.core.clock import Clock, utc_now_iso
from planbox.core.db import transaction
from planbox.core.entities import EntityRef
from planbox.core.errors import Conflict, NotFound, ValidationFailed
from planbox.core.ids import is_valid_id, new_id
from planbox.core.tags.models import Tag
from planbox.core.tags.repository import TagRepository

MAX_NAME_LENGTH = 64
_FORBIDDEN = re.compile(r"[\s#@]")


def normalize_tag_name(name: str) -> str:
    """Trims a tag name and checks it.

    Tag names are single words without ``#`` or ``@`` so quick-add can parse
    ``@tag`` unambiguously.

    Raises:
        ValidationFailed: If the name is empty, too long, or has spaces, # or @.
    """
    cleaned = name.strip()
    if not cleaned:
        raise ValidationFailed("A tag needs a name.")
    if len(cleaned) > MAX_NAME_LENGTH:
        raise ValidationFailed(f"Tag names are at most {MAX_NAME_LENGTH} characters.")
    if _FORBIDDEN.search(cleaned):
        raise ValidationFailed("Tag names are single words without spaces, # or @.")
    return cleaned


class TagService:
    """Creates, renames and deletes tags; attaches them to entities."""

    def __init__(self, conn: sqlite3.Connection, repository: TagRepository, clock: Clock) -> None:
        self._conn = conn
        self._repo = repository
        self._clock = clock

    def list(self) -> list[Tag]:
        """All live tags, alphabetically."""
        return self._repo.list_live()

    def create(self, name: str, tag_id: str | None = None) -> tuple[Tag, bool]:
        """Creates a tag; repeating a create with the same client id returns the existing tag.

        Returns:
            The tag and whether it was newly created.

        Raises:
            ValidationFailed: If the name or id is invalid.
            Conflict: If a live tag already has this name.
        """
        cleaned = normalize_tag_name(name)
        if tag_id is not None and not is_valid_id(tag_id):
            raise ValidationFailed("Ids must be UUIDv7.")
        with transaction(self._conn):
            if tag_id is not None:
                existing = self._repo.get(tag_id)
                if existing is not None:
                    return existing, False
            if self._repo.find_live_by_name(cleaned) is not None:
                raise Conflict(f"A tag named {cleaned!r} already exists.")
            now = utc_now_iso(self._clock)
            tag = Tag(
                id=tag_id or new_id(), name=cleaned, created_at=now, updated_at=now, deleted_at=None
            )
            self._repo.insert(tag)
            return tag, True

    def rename(self, tag_id: str, name: str) -> Tag:
        """Renames a live tag.

        Raises:
            NotFound: If the tag does not exist or is deleted.
            Conflict: If another live tag has this name.
        """
        cleaned = normalize_tag_name(name)
        with transaction(self._conn):
            self._live(tag_id)
            other = self._repo.find_live_by_name(cleaned)
            if other is not None and other.id != tag_id:
                raise Conflict(f"A tag named {cleaned!r} already exists.")
            self._repo.rename(tag_id, cleaned, utc_now_iso(self._clock))
            return self._live(tag_id)

    def delete(self, tag_id: str) -> str:
        """Deletes a tag (and detaches it everywhere); returns the deletion stamp."""
        with transaction(self._conn):
            self._live(tag_id)
            now = utc_now_iso(self._clock)
            self._repo.soft_delete(tag_id, now)
            return now

    def restore(self, tag_id: str) -> Tag:
        """Undoes a delete, including the attachments removed with it.

        Raises:
            NotFound: If the tag does not exist or is not deleted.
            Conflict: If a live tag took its name meanwhile.
        """
        with transaction(self._conn):
            tag = self._repo.get(tag_id)
            if tag is None or tag.deleted_at is None:
                raise NotFound("No deleted tag with this id.")
            if self._repo.find_live_by_name(tag.name) is not None:
                raise Conflict(f"A tag named {tag.name!r} exists again; rename one first.")
            self._repo.restore(tag_id, tag.deleted_at, utc_now_iso(self._clock))
            return self._live(tag_id)

    def tags_for(self, entity_type: str, entity_ids: Sequence[str]) -> dict[str, list[str]]:
        """Live tag ids per entity."""
        return self._repo.tag_ids_for(entity_type, entity_ids)

    def set_tags(self, ref: EntityRef, tag_ids: Sequence[str]) -> list[str]:
        """Makes ``tag_ids`` exactly the entity's tags; joins the caller's transaction.

        Returns:
            The entity's tag ids afterwards.

        Raises:
            ValidationFailed: If a tag id is unknown or deleted.
        """
        wanted = list(dict.fromkeys(tag_ids))
        with transaction(self._conn):
            unknown = set(wanted) - self._repo.live_ids(wanted)
            if unknown:
                raise ValidationFailed(f"Unknown tags: {', '.join(sorted(unknown))}")
            current = self._repo.live_taggings(ref.entity_type, ref.entity_id)
            now = utc_now_iso(self._clock)
            for tag_id, tagging_id in current.items():
                if tag_id not in wanted:
                    self._repo.delete_tagging(tagging_id, now)
            for tag_id in wanted:
                if tag_id not in current:
                    self._repo.insert_tagging(new_id(), tag_id, ref.entity_type, ref.entity_id, now)
            return self._repo.tag_ids_for(ref.entity_type, [ref.entity_id]).get(ref.entity_id, [])

    def _live(self, tag_id: str) -> Tag:
        tag = self._repo.get(tag_id)
        if tag is None or tag.deleted_at is not None:
            raise NotFound("No tag with this id.")
        return tag
