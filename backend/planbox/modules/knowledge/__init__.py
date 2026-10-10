"""Knowledge module: collections of notes, links and snippets."""

import sqlite3
from collections.abc import Sequence
from pathlib import Path

from planbox.core.entities import EntitySummary, EntityType
from planbox.core.module import Module
from planbox.modules.knowledge.repository import summarize_entries
from planbox.modules.knowledge.router import router
from planbox.modules.knowledge.service import ENTITY_TYPE


def _summarize(conn: sqlite3.Connection, ids: Sequence[str]) -> dict[str, EntitySummary]:
    return {
        entry_id: EntitySummary(title=title, deleted=deleted)
        for entry_id, (title, deleted) in summarize_entries(conn, ids).items()
    }


module = Module(
    id="knowledge",
    router=router,
    migrations_dir=Path(__file__).parent / "migrations",
    entity_types=(EntityType(ENTITY_TYPE, _summarize),),
)
