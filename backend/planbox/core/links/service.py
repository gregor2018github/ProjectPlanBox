"""Link use cases. Entities are resolved through the registry, never imported."""

import sqlite3
from collections.abc import Iterable, Mapping

from planbox.core.clock import Clock, utc_now_iso
from planbox.core.db import transaction
from planbox.core.entities import EntityRef, EntityRegistry, EntitySummary
from planbox.core.errors import Conflict, NotFound, ValidationFailed
from planbox.core.ids import is_valid_id, new_id
from planbox.core.links.models import Link, LinkEnd, LinkView
from planbox.core.links.repository import LinkRepository

UNKNOWN_TITLE = "Unknown item"


def parse_ref(text: str) -> EntityRef:
    """Parses ``<module>.<kind>:<id>`` for the API.

    Raises:
        ValidationFailed: If the text is not an entity reference.
    """
    try:
        return EntityRef.parse(text)
    except ValueError as exc:
        raise ValidationFailed(f"Not an entity reference: {text!r}.") from exc


class LinkService:
    """Creates, lists and removes links between any two entities."""

    def __init__(
        self,
        conn: sqlite3.Connection,
        repository: LinkRepository,
        registry: EntityRegistry,
        clock: Clock,
    ) -> None:
        self._conn = conn
        self._repo = repository
        self._registry = registry
        self._clock = clock

    def links_of(self, ref: EntityRef) -> list[LinkView]:
        """Live links in both directions, oldest first, with both ends summarised."""
        links = self._repo.live_for(ref)
        return self._views(links)

    def create(
        self, source: EntityRef, target: EntityRef, link_id: str | None
    ) -> tuple[LinkView, bool]:
        """Links ``source`` to ``target``; repeating a create with the same id returns it.

        Returns:
            The link and whether it was newly created.

        Raises:
            ValidationFailed: If an end is unknown or deleted, or both ends are the same.
            Conflict: If the two entities are already linked (in either direction).
        """
        if link_id is not None and not is_valid_id(link_id):
            raise ValidationFailed("Ids must be lowercase UUIDv7.")
        if source == target:
            raise ValidationFailed("An item cannot link to itself.")
        with transaction(self._conn):
            if link_id is not None and (existing := self._repo.get(link_id)) is not None:
                return self._views([existing])[0], False
            for end in (source, target):
                summary = self._summaries([end]).get(end)
                if summary is None or summary.deleted:
                    raise ValidationFailed(f"Nothing to link at {end}.")
            if self._repo.live_between(source, target) is not None:
                raise Conflict("These two items are already linked.")
            now = utc_now_iso(self._clock)
            link = Link(
                id=link_id or new_id(),
                source=source,
                target=target,
                created_at=now,
                updated_at=now,
                deleted_at=None,
            )
            self._repo.insert(link)
            return self._views([link])[0], True

    def delete(self, link_id: str) -> str:
        """Removes a link; returns the deletion stamp.

        Raises:
            NotFound: If there is no live link with this id.
        """
        with transaction(self._conn):
            link = self._repo.get(link_id)
            if link is None or link.deleted_at is not None:
                raise NotFound("No link with this id.")
            now = utc_now_iso(self._clock)
            self._repo.set_deleted(link_id, now, now)
            return now

    def restore(self, link_id: str) -> LinkView:
        """Undoes a delete.

        Raises:
            NotFound: If there is no deleted link with this id.
            Conflict: If the two entities were linked again meanwhile.
        """
        with transaction(self._conn):
            link = self._repo.get(link_id)
            if link is None or link.deleted_at is None:
                raise NotFound("No deleted link with this id.")
            if self._repo.live_between(link.source, link.target) is not None:
                raise Conflict("These two items are already linked again.")
            self._repo.set_deleted(link_id, None, utc_now_iso(self._clock))
            return self._views([link])[0]

    def _views(self, links: list[Link]) -> list[LinkView]:
        summaries = self._summaries(end for link in links for end in (link.source, link.target))

        def end(ref: EntityRef) -> LinkEnd:
            summary = summaries.get(ref)
            if summary is None:
                return LinkEnd(ref=ref, title=UNKNOWN_TITLE, deleted=True)
            return LinkEnd(ref=ref, title=summary.title, deleted=summary.deleted)

        return [
            LinkView(
                id=link.id,
                source=end(link.source),
                target=end(link.target),
                created_at=link.created_at,
            )
            for link in links
        ]

    def _summaries(self, refs: Iterable[EntityRef]) -> Mapping[EntityRef, EntitySummary]:
        """Summaries per ref; refs of unregistered types or unknown ids are missing."""
        ids_by_type: dict[str, list[str]] = {}
        for ref in refs:
            ids_by_type.setdefault(ref.entity_type, []).append(ref.entity_id)
        result: dict[EntityRef, EntitySummary] = {}
        for entity_type, ids in ids_by_type.items():
            registered = self._registry.get(entity_type)
            if registered is None:
                continue
            for entity_id, summary in registered.summarize(
                self._conn, list(dict.fromkeys(ids))
            ).items():
                result[EntityRef(entity_type, entity_id)] = summary
        return result
