"""Knowledge use cases: collections and their notes, links and snippets.

Rules (ARCHITECTURE §7b): an entry's kind is fixed at creation; links need an
http(s) URL; only snippets have a language; deleting a collection deletes its
entries with one shared ``deleted_at`` so a single restore undoes it exactly.
"""

import re
import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import cast

from planbox.core.clock import Clock, utc_now_iso
from planbox.core.db import transaction
from planbox.core.entities import EntityRef
from planbox.core.errors import Conflict, NotFound, ValidationFailed
from planbox.core.ids import is_valid_id, new_id
from planbox.core.placement import free_position, place
from planbox.core.tags.service import TagService
from planbox.modules.knowledge.models import Collection, Deletion, Entry, EntryKind, EntryRecord
from planbox.modules.knowledge.repository import CollectionRepository, EntryRepository

ENTITY_TYPE = "knowledge.entry"
MAX_NAME = 200
MAX_TITLE = 500
MAX_BODY = 100_000
MAX_URL = 2_000
MAX_LANGUAGE = 40
_WHITESPACE = re.compile(r"\s+")
_URL = re.compile(r"^https?://\S+$", re.IGNORECASE)


@dataclass(frozen=True, slots=True)
class Repositories:
    """The module's repositories on one connection."""

    collections: CollectionRepository
    entries: EntryRepository

    @classmethod
    def on(cls, conn: sqlite3.Connection) -> "Repositories":
        """Builds all repositories on ``conn``."""
        return cls(CollectionRepository(conn), EntryRepository(conn))


@dataclass(frozen=True, slots=True)
class NewEntry:
    """Input for creating an entry."""

    kind: EntryKind
    title: str
    id: str | None = None
    collection_id: str | None = None
    body: str = ""
    url: str | None = None
    language: str | None = None
    tag_ids: list[str] = field(default_factory=list[str])


# ------------------------------------------------------------------ helpers


def _one_line(text: str, what: str, limit: int) -> str:
    cleaned = _WHITESPACE.sub(" ", text).strip()
    if not cleaned:
        raise ValidationFailed(f"A {what} cannot be empty.")
    if len(cleaned) > limit:
        raise ValidationFailed(f"{what.capitalize()}s are at most {limit} characters.")
    return cleaned


def clean_body(body: str) -> str:
    """Checks the body length (bodies keep their line breaks and indentation)."""
    if len(body) > MAX_BODY:
        raise ValidationFailed(f"The text is at most {MAX_BODY} characters.")
    return body


def clean_url(url: str) -> str:
    """Trims a URL and accepts only http(s), so a link can never run script.

    Raises:
        ValidationFailed: If the URL is not http(s) or too long.
    """
    cleaned = url.strip()
    if _URL.fullmatch(cleaned) is None:
        raise ValidationFailed("Links need a web address starting with http:// or https://.")
    if len(cleaned) > MAX_URL:
        raise ValidationFailed(f"Web addresses are at most {MAX_URL} characters.")
    return cleaned


def clean_language(language: str | None) -> str | None:
    """Trims a snippet language; blank means none."""
    if language is None or not language.strip():
        return None
    return _one_line(language, "language", MAX_LANGUAGE)


def check_client_id(entity_id: str | None) -> None:
    """Rejects client ids that are not UUIDv7."""
    if entity_id is not None and not is_valid_id(entity_id):
        raise ValidationFailed("Ids must be lowercase UUIDv7.")


def _live[T: (Collection, Entry)](row: T | None, what: str) -> T:
    if row is None or row.deleted_at is not None:
        raise NotFound(f"No {what} with this id.")
    return row


def _deleted[T: (Collection, Entry)](row: T | None, what: str) -> tuple[T, str]:
    """Returns a deleted row and its deletion stamp."""
    if row is None or row.deleted_at is None:
        raise NotFound(f"No deleted {what} with this id.")
    return row, row.deleted_at


# -------------------------------------------------------------- collections


class CollectionService:
    """Collections group entries."""

    def __init__(self, conn: sqlite3.Connection, repos: Repositories, clock: Clock) -> None:
        self._conn = conn
        self._repos = repos
        self._clock = clock

    def list_live(self) -> list[Collection]:
        """Live collections in order."""
        return self._repos.collections.list_live()

    def create(self, name: str, collection_id: str | None) -> tuple[Collection, bool]:
        """Creates a collection at the end; idempotent per client id."""
        check_client_id(collection_id)
        cleaned = _one_line(name, "name", MAX_NAME)
        with transaction(self._conn):
            if collection_id is not None and (
                existing := self._repos.collections.get(collection_id)
            ):
                return existing, False
            now = utc_now_iso(self._clock)
            collection = Collection(
                id=collection_id or new_id(),
                name=cleaned,
                position=place(self._repos.collections.positions(), None, None),
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            self._repos.collections.insert(collection)
            return collection, True

    def rename(self, collection_id: str, name: str) -> Collection:
        """Renames a collection."""
        cleaned = _one_line(name, "name", MAX_NAME)
        with transaction(self._conn):
            _live(self._repos.collections.get(collection_id), "collection")
            self._repos.collections.update(
                collection_id, {"name": cleaned}, utc_now_iso(self._clock)
            )
            return _live(self._repos.collections.get(collection_id), "collection")

    def move(self, collection_id: str, before_id: str | None, after_id: str | None) -> Collection:
        """Reorders a collection."""
        with transaction(self._conn):
            _live(self._repos.collections.get(collection_id), "collection")
            siblings = self._repos.collections.positions(exclude_id=collection_id)
            position = place(siblings, before_id, after_id)
            self._repos.collections.update(
                collection_id, {"position": position}, utc_now_iso(self._clock)
            )
            return _live(self._repos.collections.get(collection_id), "collection")

    def delete(self, collection_id: str) -> Deletion:
        """Deletes a collection with its entries."""
        with transaction(self._conn):
            _live(self._repos.collections.get(collection_id), "collection")
            now = utc_now_iso(self._clock)
            entry_ids = self._repos.entries.live_ids_in(collection_id)
            entries = self._repos.entries.set_deleted(entry_ids, now, now)
            self._repos.collections.set_deleted(collection_id, now, now)
            return Deletion(now, collections=1, entries=entries)

    def restore(self, collection_id: str) -> Deletion:
        """Undoes a delete, bringing back exactly the entries deleted with it."""
        with transaction(self._conn):
            collection, stamp = _deleted(self._repos.collections.get(collection_id), "collection")
            now = utc_now_iso(self._clock)
            entry_ids = self._repos.entries.ids_deleted_with(collection_id, stamp)
            position = free_position(self._repos.collections.positions(), collection.position)
            self._repos.collections.set_deleted(collection_id, None, now)
            self._repos.collections.update(collection_id, {"position": position}, now)
            entries = self._repos.entries.set_deleted(entry_ids, None, now)
            return Deletion(stamp, collections=1, entries=entries)


# ------------------------------------------------------------------ entries


class EntryService:
    """Notes, links and snippets."""

    def __init__(
        self, conn: sqlite3.Connection, repos: Repositories, tags: TagService, clock: Clock
    ) -> None:
        self._conn = conn
        self._repos = repos
        self._tags = tags
        self._clock = clock

    def list_live(self) -> list[EntryRecord]:
        """Every live entry with its tags, most recently changed first."""
        entries = self._repos.entries.list_live()
        tags = self._tags.tags_for(ENTITY_TYPE, [e.id for e in entries])
        return [EntryRecord(e, tags.get(e.id, [])) for e in entries]

    def create(self, new: NewEntry) -> tuple[EntryRecord, bool]:
        """Creates an entry; idempotent per client id.

        Raises:
            ValidationFailed: If a field breaks the kind's rules, or the collection is unknown.
        """
        check_client_id(new.id)
        title = _one_line(new.title, "title", MAX_TITLE)
        body = clean_body(new.body)
        if new.kind == "link":
            url = clean_url(new.url or "")
        elif new.url is not None:
            raise ValidationFailed("Only links have a web address.")
        else:
            url = None
        language = clean_language(new.language)
        if language is not None and new.kind != "snippet":
            raise ValidationFailed("Only snippets have a language.")
        with transaction(self._conn):
            if new.id is not None and (existing := self._repos.entries.get(new.id)) is not None:
                return self._record(existing), False
            self._check_collection(new.collection_id)
            now = utc_now_iso(self._clock)
            entry = Entry(
                id=new.id or new_id(),
                collection_id=new.collection_id,
                kind=new.kind,
                title=title,
                body=body,
                url=url,
                language=language,
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            self._repos.entries.insert(entry)
            if new.tag_ids:
                self._tags.set_tags(EntityRef(ENTITY_TYPE, entry.id), new.tag_ids)
            return self._record(entry), True

    def update(self, entry_id: str, changes: Mapping[str, object]) -> EntryRecord:
        """Applies a partial update; absent keys stay, ``None`` clears where allowed.

        Raises:
            NotFound: If the entry does not exist or is deleted.
            ValidationFailed: If a change breaks the kind's rules.
        """
        with transaction(self._conn):
            entry = _live(self._repos.entries.get(entry_id), "entry")
            fields = self._clean_changes(entry, changes)
            now = utc_now_iso(self._clock)
            self._repos.entries.update(entry_id, fields, now)
            if "tag_ids" in changes:
                tag_ids = changes["tag_ids"]
                if not isinstance(tag_ids, list):
                    raise ValidationFailed("tag_ids must be a list.")
                self._tags.set_tags(
                    EntityRef(ENTITY_TYPE, entry_id),
                    [str(t) for t in cast("list[object]", tag_ids)],
                )
                self._repos.entries.touch(entry_id, now)
            return self._record(_live(self._repos.entries.get(entry_id), "entry"))

    def delete(self, entry_id: str) -> Deletion:
        """Deletes an entry (undo with restore)."""
        with transaction(self._conn):
            _live(self._repos.entries.get(entry_id), "entry")
            now = utc_now_iso(self._clock)
            self._repos.entries.set_deleted([entry_id], now, now)
            return Deletion(now, entries=1)

    def restore(self, entry_id: str) -> EntryRecord:
        """Undoes a delete.

        Raises:
            Conflict: If the entry's collection is deleted (restore the collection instead).
        """
        with transaction(self._conn):
            entry, _ = _deleted(self._repos.entries.get(entry_id), "entry")
            if entry.collection_id is not None:
                collection = self._repos.collections.get(entry.collection_id)
                if collection is None or collection.deleted_at is not None:
                    raise Conflict("This entry's collection is deleted. Restore it first.")
            self._repos.entries.set_deleted([entry_id], None, utc_now_iso(self._clock))
            return self._record(_live(self._repos.entries.get(entry_id), "entry"))

    def _clean_changes(self, entry: Entry, changes: Mapping[str, object]) -> dict[str, object]:
        fields: dict[str, object] = {}
        for name, value in changes.items():
            if name == "title":
                fields[name] = _one_line(str(value), "title", MAX_TITLE)
            elif name == "body":
                fields[name] = clean_body(str(value))
            elif name == "url":
                if entry.kind != "link":
                    raise ValidationFailed("Only links have a web address.")
                fields[name] = clean_url(str(value or ""))
            elif name == "language":
                if entry.kind != "snippet":
                    raise ValidationFailed("Only snippets have a language.")
                fields[name] = clean_language(None if value is None else str(value))
            elif name == "collection_id":
                collection_id = None if value is None else str(value)
                self._check_collection(collection_id)
                fields[name] = collection_id
            elif name != "tag_ids":
                raise ValidationFailed(f"{name} cannot be changed.")
        return fields

    def _check_collection(self, collection_id: str | None) -> None:
        if collection_id is not None:
            collection = self._repos.collections.get(collection_id)
            if collection is None or collection.deleted_at is not None:
                raise ValidationFailed("Unknown collection.")

    def _record(self, entry: Entry) -> EntryRecord:
        tags = self._tags.tags_for(ENTITY_TYPE, [entry.id]).get(entry.id, [])
        return EntryRecord(entry, tags)
