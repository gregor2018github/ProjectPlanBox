# Architecture

PlanBox is a **modular monolith**: one backend process, one SQLite database
and one frontend bundle. Inside them, each feature area is a module with hard
boundaries. A small **core** provides the shared pieces: the database,
migrations, IDs, time, errors, and the cross-cutting concepts of tags, links
and search.

## 1. Repository layout

```
ProjectPlanBox/
├── pyproject.toml            # Python deps, Ruff, pyright, pytest config
├── .venv/                    # virtual environment (gitignored)
├── backend/
│   ├── planbox/
│   │   ├── main.py           # create_app(): the composition root
│   │   ├── config.py         # Settings (frozen dataclass, read from env)
│   │   ├── core/
│   │   │   ├── db/           # connection.py, migrations.py, backup.py, deps.py (FastAPI deps)
│   │   │   ├── migrations/   # core's own numbered .sql files
│   │   │   ├── ids.py        # new_id() -> UUIDv7 text
│   │   │   ├── clock.py      # Clock protocol, SystemClock, utc_now_iso()
│   │   │   ├── ordering.py   # fractional position keys
│   │   │   ├── placement.py  # place()/free_position(): a key among ordered siblings
│   │   │   ├── recurrence.py # RRULE validation and expansion (calendar events, repeating todos)
│   │   │   ├── errors.py     # domain errors -> RFC 9457 problem+json
│   │   │   ├── entities.py   # EntityRef, EntityType registry
│   │   │   ├── module.py     # the Module manifest type
│   │   │   ├── meta/         # GET /api/health, GET /api/meta (router/service/repository)
│   │   │   ├── lifecycle/    # POST /api/shutdown (only when started by the launcher)
│   │   │   ├── tags/         # repository / service / router / schemas
│   │   │   ├── links/        # links between any two entities (phase 2)
│   │   │   └── search/       # full-text index and GET /api/search (phase 3)
│   │   └── modules/
│   │       ├── __init__.py   # ENABLED_MODULES: the only list of modules
│   │       ├── knowledge/    # collections, notes, links, snippets (same layout as todos)
│   │       ├── calendar/     # events and recurring series
│   │       ├── habits/       # habits, check-ins, streaks (streaks.py is pure)
│   │       └── todos/
│   │           ├── __init__.py      # `module = Module(...)`
│   │           ├── migrations/      # 0001_create_todos.sql, 0002_add_recurrence.sql
│   │           ├── models.py        # frozen dataclasses (domain rows)
│   │           ├── schemas.py       # Pydantic request/response models
│   │           ├── repository.py    # SQL only
│   │           ├── service.py       # logic + transactions
│   │           └── router.py        # HTTP only
│   └── tests/                # mirrors planbox/; plus test_boundaries.py
├── frontend/
│   ├── package.json, vite.config.ts, tsconfig*.json, eslint.config.js
│   ├── eslint-rules.js       # local rules: module boundaries, Base UI only in ui/, one component per file
│   ├── index.html            # inline theme bootstrap (avoids a flash of the wrong theme)
│   ├── e2e/                  # Playwright smoke suite (from phase 1)
│   └── src/
│       ├── main.tsx
│       ├── app/              # App (providers), router, AppShell, Sidebar, DetailPanel, pages
│       ├── core/             # api/ (client, generated schema, queries), commands/ (registry,
│       │                     # palette), shortcuts/ (registry, overview), links/ (LinkedItems,
│       │                     # linkable sources), search/ (server search, match marks), tags/,
│       │                     # calendar/ (feeds), recurrence/ (rule
│       │                     # text + the shared repeat editor), theme/, time, ids, module
│       ├── ui/               # design system: Base UI wrappers (Dialog, Sheet, Tooltip, Toaster,
│       │                     # SegmentedControl), Button, IconButton, Kbd, motion presets, and
│       │                     # small shared composites (NameDialog, PageHeader, InlineTitle, …)
│       ├── styles/           # tokens.css (+ contrast test), index.css
│       ├── test/             # Vitest setup, renderApp() with a fake API
│       └── modules/
│           ├── index.ts      # MODULES: the only list of modules
│           ├── knowledge/    # same layout as todos
│           ├── calendar/
│           ├── habits/       # page, detail panel, rail pane (today's habits)
│           └── todos/        # api.ts, routes.tsx, components/, quickAddParser.ts, index.ts
├── shared/                   # language-neutral fixtures (e.g. ordering test vectors)
├── main.py                   # the launcher: py main.py starts PlanBox and opens the browser
├── scripts/                  # setup.py, dev.py, test.py, check.py, gen_api.py, serve.py
├── private_data/             # everything that must not leave this PC: DB, settings, backups (gitignored)
└── docs/
```

Python lives in a root `pyproject.toml` (not inside `backend/`). This lets
VS Code, Ruff and pyright find `.venv` and the config without extra setup.

## 2. Module boundaries

### The rules

1. A module owns its tables, migrations, repository, service, router and
   frontend folder. Nothing else reads or writes its tables.
2. A module may import from `core` (backend) or `core`/`ui` (frontend).
   It may **never** import from another module.
3. `core` never imports from any module.
4. Modules are registered in exactly one place per side:
   `backend/planbox/modules/__init__.py` and `frontend/src/modules/index.ts`.
   These two files are the composition root, not part of any module. Adding a
   module means adding one line to each and touching no other module.
5. Cross-module features (a todo linking to a note, "everything tagged X",
   global search) go through core concepts that address entities by
   **`EntityRef`** (`entity_type` + `entity_id`, where `entity_type` is
   something like `todos.todo` or `knowledge.note`). They never go through
   imports.

The rules are enforced, not just written down:

- Backend: `tests/test_boundaries.py` walks every module's imports with
  `ast` and fails on a forbidden import. It also checks that each module's
  tables use its own prefix.
- Frontend: the local ESLint rule `planbox/boundaries`
  (`frontend/eslint-rules.js`) resolves every relative import.
  `modules/x/**` may not import `modules/y/**`, `core/**` and `ui/**` may not
  import `modules/**`, and only `ui/**` may import `@base-ui/*`.

> **Why explicit registration rather than auto-discovery?** A plugin scanner
> would remove the one-line edit, but it adds import-order magic and makes
> "which modules are on?" harder to answer. The registry file belongs to no
> module, so the rule "adding a module must not require editing other
> modules" still holds.

### Backend module manifest

```python
@dataclass(frozen=True)
class Module:
    id: str                                  # "todos": the table prefix, URL prefix and entity_type prefix
    router: APIRouter                        # mounted at /api/{id}
    migrations_dir: Path
    entity_types: Sequence[EntityType] = ()  # what this module exposes to tags/links/search
```

### Frontend module manifest

```ts
// src/core/module.ts
interface ModuleManifest {
  id: string;                                  // matches the backend module id
  label: string;
  homePath?: string;                           // where "/" redirects (first module wins)
  routes: (parent: AnyRoute) => AnyRoute[];    // attached under the root route
  SidebarSection?: ComponentType;              // the module renders its own nav (lists, counts)
  Host?: ComponentType;                        // mounted once: registers commands, shortcuts, quick-add
  detail?: Record<string, ComponentType<{ id: string }>>; // per entity type, for ?item=
  rail?: { label; icon; shortcut?; Pane };     // an icon in the right-hand rail that toggles a side pane
}
```

**Calendar feeds** (`core/calendar/`). Modules put dated items on the
calendar without the calendar importing them: a module's Host publishes a
feed (`useCalendarFeed`) of entries addressed by entity ref, with
`reschedule` and `toggleDone` callbacks; the calendar reads all feeds
(`useCalendarFeeds`). Calendar days are drop targets carrying
`{ kind: "date", date }`; a module's draggable reads it with
`droppedDate(info)` (todos turn it into a due date).

**Linkable sources** (`core/links/`). The same pattern feeds the link
picker: a module's Host publishes its entities (`useLinkableSource`) with
an icon, a noun and a hint per item; the core `LinkedItems` block (rendered
by each module's detail panel) offers all of them. Titles of existing
links come from the server's summaries, so a link still displays when its
target is not in any cache.

Modules contribute through **components rather than data**. A
`SidebarSection` can show live counts from the query cache, and a `Host` can
call `useCommands()` and `useShortcut()` like any other component, so the
shell needs no plugin API for each concern. Entity display for links did
not need a manifest field either: it travels with the linkable source.

## 3. Backend layers

```
HTTP request
   │
   ▼
router.py    HTTP only: parse/validate (Pydantic), call the service, map to a response model.
   │         Sync `def` handlers (sqlite3 blocks; FastAPI runs them in its threadpool).
   ▼
service.py   Logic: rules, defaults, position keys, cross-core calls (tags, search).
   │         Owns the transaction: `with transaction(conn):` per use case.
   ▼
repository.py  SQL only: parameterised statements, returns frozen dataclasses.
               Never commits, never contains business rules.
```

- **No SQL outside repositories.** The migration runner is infrastructure
  and the one exception. It executes `.sql` files.
- **Connections:** one connection per request, provided by a FastAPI
  dependency, opened with `autocommit=True`. Transactions are explicit
  `BEGIN IMMEDIATE … COMMIT`, run through `core.db.transaction()`.
  Connections are cheap in SQLite, and per-request connections avoid sharing
  them across threads.
- **Per-connection pragmas:** `foreign_keys=ON`, `busy_timeout=5000`,
  `synchronous=NORMAL`. `journal_mode=WAL` is set once and persists in the
  file.
- **Dependency wiring:** routers get services through `Depends` factories
  that build `Service(Repository(conn), TagService(TagRepository(conn)),
  clock)`. The services share one connection, so a todo write and its tag
  changes commit or roll back together.
- **Clock and IDs are injected.** Tests use a fixed clock.
- **Errors:** services raise `NotFound`, `Conflict` or `ValidationFailed`
  from `core.errors`. A single exception handler turns them into
  `application/problem+json` (RFC 9457) with a stable `code` field that the
  frontend can switch on.
- **Pydantic stays at the HTTP edge.** Repositories and services use frozen
  dataclasses (`models.py`). Routers convert to response schemas
  (`schemas.py`). The OpenAPI schema therefore describes exactly what crosses
  the wire.

### Why no ORM

SQLAlchemy Core or SQLModel would add a large dependency to give us query
building we barely need. Our queries are simple, SQLite-specific (partial
indexes, FTS5, `STRICT`, `RETURNING`) and written once per module. Plain SQL
in repositories, tested against a real temporary database, is easier to read
and debug. The repository layer keeps the cost contained.

## 4. Data model conventions

These apply to every table except `schema_migrations`, which is migration
bookkeeping and is never synced.

| Rule | Detail |
|---|---|
| Table names | Prefixed with the owner: `core_*` or `<module_id>*` (e.g. `todos`, `todos_lists`) |
| `STRICT` tables | Yes (SQLite ≥ 3.37; the bundled version is 3.49) |
| Primary key | `id TEXT PRIMARY KEY`: a UUIDv7, lowercase and hyphenated. It is time-ordered, so inserts stay local in the B-tree. |
| Who creates IDs | The client may send an `id` on create (this makes optimistic creates exact and requests idempotent). Otherwise the server generates one. The server validates the format. |
| Timestamps | `created_at`, `updated_at` and `deleted_at` (nullable), as `TEXT`. UTC ISO-8601 at fixed width with milliseconds and a `Z`: `2026-10-08T16:33:04.390Z`. Fixed width means string order equals time order. The application sets them, never SQLite defaults. |
| Soft delete | `DELETE` endpoints set `deleted_at`. Repositories filter `deleted_at IS NULL` by default. `POST …/restore` clears it. Rows are not purged until sync is designed, so tombstones stay. |
| Uniqueness | Partial unique indexes `WHERE deleted_at IS NULL`, so a deleted name can be reused |
| Calendar dates | **Floating** local dates as `TEXT 'YYYY-MM-DD'`, not timestamps (see below) |
| Ordering | `position TEXT`: fractional index keys (base-62 strings). Moving an item updates one row. The keys are sync-friendly. |
| Recurrence | `rrule TEXT` (iCalendar RRULE, without `DTSTART`) plus an anchor (an event's start; a todo's `recurrence_anchor`). Validated and expanded only by `core/recurrence.py`. |
| Foreign keys | Real FKs inside a module. Never across modules. Cross-module references are `EntityRef` pairs. |

### Dates vs. timestamps

Timestamps are stored in UTC, which is right for **instants**
(`created_at`, `completed_at`, a timed calendar event). A **due date** is
not an instant, though. "Due Friday" means Friday wherever I am. If it were
stored as a UTC midnight, it would show up on Thursday in another time zone,
and the "today" logic would be fragile around DST. So:

- Instants are stored as UTC ISO-8601 and shown in local time.
- Date-only values (due dates, habit check-in days, all-day events) are stored
  as floating `YYYY-MM-DD`, the way iCalendar treats `VALUE=DATE`.
- "Today" is computed in the configured zone (`PLANBOX_TIMEZONE`, default
  `Europe/Amsterdam`). The frontend reads it from `GET /api/meta` and does
  **not** use the browser's zone. That way a phone abroad and the desktop
  agree.
- Weeks start on Monday everywhere (`weekStartsOn: 1`).

## 5. Migrations

```
backend/planbox/core/migrations/0001_create_tags.sql
backend/planbox/modules/todos/migrations/0001_create_todos.sql
backend/planbox/modules/todos/migrations/0002_add_recurrence.sql
```

- Each owner (core and each module) has its own sequence, `NNNN_snake_name.sql`.
  This keeps modules from editing each other's migration folders.
- Bookkeeping table: `schema_migrations(owner, version, name, checksum,
  applied_at, PRIMARY KEY (owner, version))`.
- Order: core first, then modules in registry order. A module's migrations
  may reference core tables but never another module's.
- Each file runs in its own transaction, together with its
  `schema_migrations` insert. If it fails, it rolls back and startup aborts.
- **Applied migrations are immutable.** The runner stores a SHA-256 checksum.
  A mismatch refuses startup. Fixes go in a new migration.
- Forward-only. No down migrations: the automatic backup is the rollback.
- Before applying any pending migration, the runner writes
  `VACUUM INTO '<data>/backups/planbox-<utc>-pre-migration.db'` and keeps
  the 10 newest.
- Table rebuilds (SQLite's 12-step `ALTER` procedure) need foreign key
  enforcement off, and that cannot be changed inside a transaction. A
  first-line directive `-- planbox: foreign_keys=off` makes the runner turn
  enforcement off around that file and run `PRAGMA foreign_key_check` before
  committing.
- Migrations run on app start (`create_app` lifespan) and from
  `scripts/migrate.py`.

## 6. Core: cross-cutting concepts

All three address entities through the **entity type registry**. Each module
declares its `EntityType`s:

```python
@dataclass(frozen=True)
class EntityType:
    name: str                                   # "todos.todo"
    summarize: Callable[[Connection, Sequence[str]], Mapping[str, EntitySummary]]
    # EntitySummary(title, deleted, hint=""); used to display links, tags and search hits.
    # hint is short context such as "Done · Work" or "Link · Recipes".
    documents: Callable[[Connection, str | None], Iterable[SearchDocument]] | None = None
    # SearchDocument(id, title, body, deleted, updated_at) changed at/after the instant
    # (all for None); feeds the search index (§6.3)
```

The core calls `summarize` through the registry and never imports the
module. The frontend side (`entityTypes` in the manifest) maps a ref to an
icon and a route.

### 6.1 Tags (built in phase 1)

```sql
CREATE TABLE core_tags (
  id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
) STRICT;
CREATE UNIQUE INDEX core_tags_name_live ON core_tags (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE core_taggings (
  id TEXT PRIMARY KEY,
  tag_id TEXT NOT NULL REFERENCES core_tags(id),
  entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
) STRICT;
CREATE UNIQUE INDEX core_taggings_live ON core_taggings (tag_id, entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX core_taggings_entity ON core_taggings (entity_type, entity_id) WHERE deleted_at IS NULL;
```

- Tags are global across modules, flat (no hierarchy) and colourless (one
  accent colour rule).
- Modules set an entity's tags through `TagService.set_tags(ref, tag_ids)`
  inside their own transaction. API payloads carry `tag_ids`. The frontend
  joins them with the cached tag list.
- Trade-off: `core_taggings` has no FK to the tagged row. This is the price
  of cross-module tags. The service validates refs on write, and orphans are
  harmless and swept by a maintenance command.

### 6.2 Links (built in phase 2)

```sql
CREATE TABLE core_links (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL, source_id TEXT NOT NULL,
  target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
) STRICT;
-- unique live (source, target); indexes on both ends for backlinks
```

- Links are directed (a todo references a note) and displayed in both
  directions ("referenced by").
- `GET /api/links?entity=todos.todo:<id>` returns both directions, oldest
  first, each as `{id, source, target, created_at}` with both ends
  summarised through the registry (`{ref, title, deleted}`). Deleted
  targets stay and show as deleted; restoring the target revives the link.
- `POST /api/links {id?, source, target}` validates both refs (registered
  type, live entity, not the same) and refuses a pair that is already
  linked in either direction (409). `DELETE /api/links/{id}` and
  `POST …/restore` give undo.
- Within one module, relationships use real FK columns, not `core_links`.

### 6.3 Search (built in phase 3)

```sql
CREATE VIRTUAL TABLE core_search USING fts5(entity_type UNINDEXED,
  entity_id UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2');
CREATE TABLE core_search_sync (id, entity_type, synced_through, created_at,
  updated_at, deleted_at) STRICT;  -- one live row per entity type
```

- **Pull, not push.** The original design had modules call
  `SearchIndex.upsert()`/`remove()` in every write transaction. Todos alone
  have about ten write paths (patch, complete, the recurrence spawn, the
  cascading deletes of areas, lists, sections and parents, restores), and
  one missed call means a silently stale index. Instead each `EntityType`
  offers `documents(conn, since)`: its rows whose `updated_at` is at or
  after `since`, deleted ones included. Every search first syncs: per type,
  read what changed since the stored watermark, replace those documents,
  drop the deleted ones, and move the watermark to the newest
  `updated_at` seen. All of this happens in one transaction before the
  query, so results are never stale, and module write paths stay
  untouched. The only contract is the one every table already follows:
  **every write bumps `updated_at`**, soft deletes included.
- The sync re-reads 60 seconds before the watermark. A write that computed
  its timestamp before a concurrent sync but committed after it is still
  picked up. Re-indexing a document is idempotent.
- Each document's FTS rowid is a 63-bit hash of its ref, so a change
  replaces the row in place without scanning the unindexed columns.
- A type without a watermark row is indexed from scratch. That makes new
  modules and the rebuild free: `py scripts\reindex.py` empties the index
  and retires the watermarks (needed only if the PC clock was set back).
- `GET /api/search?q=&limit=` (max 50): every word must match as a prefix
  (`rep out` finds "Report outline"). The input is reduced to words and
  quoted, so FTS5 syntax typed by the user is inert. Ranking is bm25 with
  the title weighted 8× over the body. Each hit carries `ref`, `title` and a
  body `snippet` (matched terms between U+E000 and U+E001, which the
  frontend renders as `<mark>`), plus the module's `hint` from `summarize`.
  The summary is fetched at query time, so a renamed list shows at once.
- Indexed today: todos (title, notes) and knowledge entries (title, text,
  and the address for links). Tags and calendar events are not indexed
  (TODO.md).
- **Frontend.** `useSearch` (`core/search/`) debounces by 150 ms and keeps
  the previous hits while the next load. The command palette lists up to 8
  matching commands, then "Search results" with each hit's icon and noun
  taken from the linkable sources (§2). Opening a hit sets `?item=` like a
  link does. The link picker keeps its instant cached list and adds server
  hits that are not cached, such as todos completed long ago. Those open in
  a read-only todo panel (`GET /api/todos/items/{id}`) with Reopen.

## 7. Todos module data model (phase 1)

Hierarchy: **Area → List → Section → Todo → Subtask**. Every level below
Area is optional. Lists may sit outside any area. Todos without a list are in
the **Inbox**. Todos may sit in a list outside any section. Subtasks are one
level deep.

```sql
CREATE TABLE todos_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  position TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
) STRICT;

CREATE TABLE todos_lists (
  id TEXT PRIMARY KEY,
  area_id TEXT REFERENCES todos_areas(id),          -- NULL = not in an area
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  position TEXT NOT NULL,                            -- order within its area (or the top level)
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
) STRICT;

CREATE TABLE todos_sections (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES todos_lists(id),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  position TEXT NOT NULL,                            -- order within its list
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
) STRICT;

CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  list_id TEXT REFERENCES todos_lists(id),          -- NULL = Inbox
  section_id TEXT REFERENCES todos_sections(id),    -- NULL = no section
  parent_id TEXT REFERENCES todos(id),              -- NULL = top-level todo; else a subtask
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  notes TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3), -- none, low, medium, high
  due_date TEXT CHECK (due_date IS NULL OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  position TEXT NOT NULL,                            -- order among siblings (see below)
  completed_at TEXT,                                 -- UTC instant; NULL = open
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  CHECK (section_id IS NULL OR list_id IS NOT NULL), -- the Inbox has no sections
  CHECK (parent_id IS NULL OR parent_id <> id)
) STRICT;
CREATE INDEX todos_siblings ON todos (list_id, section_id, parent_id, position) WHERE deleted_at IS NULL;
CREATE INDEX todos_by_parent ON todos (parent_id) WHERE deleted_at IS NULL AND parent_id IS NOT NULL;
CREATE INDEX todos_open_by_due ON todos (due_date) WHERE deleted_at IS NULL AND completed_at IS NULL;
CREATE INDEX todos_completed ON todos (completed_at) WHERE deleted_at IS NULL AND completed_at IS NOT NULL;
```

**Invariants.** The service enforces these and tests cover them. The ones
that can be enforced in SQL are also CHECK constraints.

- **Siblings** are todos sharing `(list_id, section_id, parent_id)`.
  `position` orders a todo among its siblings only.
- A section belongs to the same list as the todos in it.
- **Subtasks are one level deep.** A subtask's parent has no parent, and a
  todo that has subtasks cannot become a subtask. A subtask always shares its
  parent's `list_id` and `section_id`. Moving a parent moves its subtasks
  with it.
- Subtasks are full todos (their own due date, priority, tags and notes).
  With a due date, a subtask appears in Today/Upcoming on its own, with its
  parent's title as context.
- **Completion:** completing a parent also completes its open subtasks with
  the *same* `completed_at`. Reopening the parent reopens exactly those
  subtasks. Completing every subtask does **not** complete the parent.
- **Deletion cascades down** with one shared `deleted_at`: area → its lists
  → their sections → their todos → subtasks. Restoring a container restores
  exactly the rows deleted with it. The undo toast says what went with it
  ("Deleted area *Work* with 4 lists and 37 todos").
- **Recurrence (phase 6, brought forward):** migration
  `0002_add_recurrence.sql` adds `rrule TEXT`, `recurrence_anchor TEXT` (a
  floating date) and `recurs_from_id` (the occurrence whose completion
  created this row). A CHECK keeps a rule only on top-level todos with a due
  date and an anchor.
  - Setting a rule anchors the series on the due date (today if there is
    none, which also becomes the due date). Moving the due date later moves
    only this occurrence. Clearing the due date or sending `rrule: null`
    stops the repeat. Subtasks cannot repeat, and a repeating todo cannot
    become a subtask.
  - Completing a repeating todo marks it done and inserts the next
    occurrence as a new row: the first date of the series after **both** its
    due date and today, so missed dates are skipped and an early completion
    does not bring it back on the same date. The copy keeps title, notes,
    priority, tags, placement (right after the original) and the rule, and
    gets fresh open copies of every subtask, their due dates shifted by the
    same number of days. COUNT/UNTIL can end the series (no copy then).
  - Reopening deletes an open next occurrence (with its subtasks), which
    makes undo exact. If that next one is already done, the reopened todo
    becomes a one-off instead of starting a second series.
  - This is why completion is its own endpoint (below), not a field patch.
- **Today's manual order:** migration `0003_add_today_position.sql` adds a
  nullable `today_position` (a fractional key). Today mixes todos from
  every list, so `position` cannot order it. Reordering a Today group
  (Overdue or Due today) sends that group's ids in order, and the server
  writes the key sequence `a0`, `a1`, … only where a row's key differs.
  Todos with a key come first in key order, and the rest follow
  auto-sorted. Changing the due date clears the key, and so does creating
  a repeat's next occurrence, so a todo arriving in Today lands at the end.
- Due dates are date-only for now (decided). Times of day arrive with the
  calendar.

### Todos API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/todos/items?completed_since=<utc>` | All open todos (including subtasks) plus those completed since the given instant (the frontend passes the start of today) |
| GET | `/api/todos/items/completed?before=<utc>&limit=50` | The logbook, cursor-paginated |
| POST | `/api/todos/items` | Optional client `id`, plus `list_id`, `section_id`, `parent_id`. Repeating a POST with the same id and body returns the existing row (idempotent). |
| PATCH | `/api/todos/items/{id}` | Partial: title, notes, priority, due_date, rrule, tag_ids. An absent field is left unchanged; `null` clears it. Placement changes go through `move`. |
| POST | `/api/todos/items/{id}/complete` · `/reopen` | The server sets `completed_at` and cascades to subtasks. For a repeating todo, `complete` also returns the inserted next occurrence; `reopen` deletes it again (the client refetches). |
| POST | `/api/todos/items/{id}/move` | `{list_id, section_id, parent_id, before_id?, after_id?}`. One endpoint for reorder, move to another list or section, and indent/outdent. The server validates the invariants and computes `position`. |
| POST | `/api/todos/today-order` | `{ids}`: one Today group, top to bottom. Returns the todos whose `today_position` changed. |
| DELETE | `/api/todos/items/{id}` · POST `…/restore` | Soft delete (with subtasks), undo |
| GET/POST/PATCH/DELETE | `/api/todos/areas[/{id}]`, `…/move`, `…/restore` | Areas |
| GET/POST/PATCH/DELETE | `/api/todos/lists[/{id}]`, `…/move` (`{area_id, before_id?, after_id?}`), `…/restore` | Lists |
| GET/POST/PATCH/DELETE | `/api/todos/sections[/{id}]`, `…/move` (`{list_id, before_id?, after_id?}`), `…/restore` | Sections |
| GET/POST/PATCH/DELETE | `/api/tags[/{id}]` | Core |
| GET | `/api/health`, `/api/meta` | Liveness and schema versions; timezone, week start, app version |

## 7b. Knowledge module data model (phase 2)

```sql
CREATE TABLE knowledge_collections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  position TEXT NOT NULL,                       -- sidebar order
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
) STRICT;

CREATE TABLE knowledge_entries (
  id TEXT PRIMARY KEY,
  collection_id TEXT REFERENCES knowledge_collections(id),  -- NULL = Unsorted
  kind TEXT NOT NULL CHECK (kind IN ('note', 'link', 'snippet')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  body TEXT NOT NULL DEFAULT '',                -- note text, link description, snippet code
  url TEXT CHECK ((kind = 'link') = (url IS NOT NULL)),
  language TEXT CHECK (language IS NULL OR (kind = 'snippet' AND length(language) <= 40)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT
) STRICT;
```

- One table for the three kinds, because they share everything except one
  column each (PLAN.md, phase 2, argues the choice). The kind is fixed at
  creation. Entity type: `knowledge.entry`.
- Links need an `http(s)` URL. The frontend adds `https://` to bare
  addresses and only ever renders http(s) as a link target.
- Entries are listed newest change first (`updated_at`); changing tags
  counts as a change. Collections are ordered by `position`.
- Deleting a collection soft-deletes its entries with the same stamp;
  restoring it restores exactly those. An entry whose collection is deleted
  cannot be restored on its own (409).

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/knowledge/collections` | List in order; create at the end (client `id`, idempotent) |
| PATCH | `/api/knowledge/collections/{id}` | Rename |
| POST | `…/collections/{id}/move` · `/restore` | `{before_id?, after_id?}`; undo a delete |
| DELETE | `/api/knowledge/collections/{id}` | With its entries; returns counts |
| GET/POST | `/api/knowledge/entries` | All live entries with `tag_ids`; create (client `id`, idempotent) |
| PATCH | `/api/knowledge/entries/{id}` | title, body, url, language, collection_id, tag_ids; absent = unchanged |
| DELETE | `/api/knowledge/entries/{id}` · POST `…/restore` | Soft delete, undo |

On the frontend the module mirrors todos: one cache of all entries
(`['knowledge','entries']`) plus collections; views are selectors over it;
every mutation is optimistic in one serial scope (`knowledge`).

## 7c. Habits module data model (phase 5)

```sql
CREATE TABLE habits (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  notes TEXT NOT NULL DEFAULT '',
  rrule TEXT NOT NULL,                 -- RRULE without DTSTART (core/recurrence.py)
  start_date TEXT NOT NULL,            -- floating date; the schedule's anchor
  position TEXT NOT NULL,              -- creation order (no reordering UI yet)
  created_at, updated_at, deleted_at
) STRICT;

CREATE TABLE habits_checkins (
  id TEXT PRIMARY KEY,
  habit_id TEXT NOT NULL REFERENCES habits(id),
  day TEXT NOT NULL,                   -- floating date in the configured zone
  created_at, updated_at, deleted_at
) STRICT;  -- unique live (habit_id, day)
```

- **Schedules** reuse the shared recurrence engine on floating dates
  (`all_day_anchor(start_date)`), so the shared repeat editor works
  unchanged. New habits are daily from today. "Does not repeat" in the
  editor is read as daily, because a habit always has a schedule.
- **Check-ins** are one live row per habit and day. Unchecking soft-deletes
  the row, and checking again inserts a new one. Both calls are idempotent.
  Future days are refused; any past day can be checked (catching up).
  Checking a day before the start date moves the start back to that day,
  so catching up on the days before a habit was added counts. (With an
  interval such as "every 2 days" this re-anchors which days are due.)
- **Streaks** (`streaks.py`, pure) count *scheduled* days in a row that
  were checked. Today does not break the current streak until it has
  passed. A check-in on an unscheduled day is kept and shown, but neither
  extends nor breaks a streak. "Best" is the longest run ever. Changing the
  schedule re-reads the whole history under the new rule, which is simple
  and predictable.
- Deleting a habit keeps its check-ins, so a restore brings its history
  back.

| Method | Path | |
|---|---|---|
| GET | `/api/habits/habits?start=&end=` | Live habits with `checkins` and `scheduled` days in the range (≤ 400 days), `current_streak`, `best_streak`, `total_checkins` |
| POST | `/api/habits/habits` | `{id?, name, notes?, rrule?, start_date?}` (idempotent per id) |
| PATCH | `/api/habits/habits/{id}` | name, notes, rrule, start_date |
| DELETE | `/api/habits/habits/{id}` · POST `…/restore` | Soft delete, undo |
| PUT / DELETE | `/api/habits/habits/{id}/checkins/{day}` | Check / uncheck a day |

On the frontend there is one cache: the habits with the last 26 whole weeks
(`['habits','list',start,end]`). The page (a 7-day strip per habit, today
last), the detail panel (stats and a 26-week history grid), the rail pane
(today's habits as checkboxes), the sidebar count and the palette's "Check
off habit" commands are all derived from it. Mutations are optimistic in
one serial scope (`habits`). They tick the day at once and extend the
current streak when today is checked. Every mutation refetches afterwards,
because only the server expands schedules and counts streaks. Habits take
part in links (a linkable source) and search (`documents`: name and notes).

## 8. Frontend data flow

```
 component ──uses──▶ module hooks (modules/todos/api.ts)
                         │  useQuery(todosQuery)          useMutation(...)
                         ▼                                    │ onMutate: cancel, snapshot,
                  TanStack Query cache ◀──── optimistic ──────┘ apply patch to cache
                         │                                      onError: rollback + toast
                         ▼                                      onSuccess: replace with server row
              core/api/client.ts (openapi-fetch, typed by generated schema.d.ts)
                         │
                         ▼  HTTP, same origin (/api); in dev Vite proxies to :8000
                     FastAPI
```

### One cache, derived views

For todos the client loads **all open todos plus today's completed ones** in
one query (`['todos','items']`). Inbox, Today, Upcoming, each area and each
list (grouped by section, subtasks nested under their parent) are
**selectors** over that array (filter, sort and group, memoised). Areas,
lists, sections and tags are small extra queries.

This is what makes the app feel instant. A single-user todo set is small:
1,000 open todos is about 300 KB of JSON over localhost. Every optimistic
update patches **one** array, and every view re-derives correctly. Setting a
due date of today makes the todo appear in Today with no per-view cache
juggling. If the set ever grows too large, the server already supports
filtered endpoints. The logbook (older completed todos) is paginated
separately.

### Optimistic mutation rules

1. Creates use a client-generated UUIDv7, so the optimistic row is the real
   row. There is no temp-ID swap.
2. All todo mutations share `scope: { id: 'todos' }`, so TanStack Query runs
   them **serially in order**. A fast complete-then-move cannot race.
3. `onMutate` cancels in-flight fetches, snapshots, and applies the same pure
   function the selectors expect (`applyTodoPatch`).
4. `onError` restores the snapshot and shows a toast with the problem's
   message. `onSuccess` writes the server row back (authoritative
   `updated_at` and `position`).
5. **Reordering:** the client computes the new position key with the same
   fractional-index algorithm as the server. It is implemented in both
   languages and verified against **one shared JSON test-vector file**. The
   client sends `before_id`/`after_id`, the server computes the key, and in
   the normal case the two match.
6. **Undo:** delete and complete push an inverse action (`restore`,
   `reopen`, move back) onto a small undo stack. The toast's "Undo" button
   and Ctrl+Z pop it.
7. No spinners for local operations. The first load renders the shell
   immediately. Content areas show a skeleton only if data takes more than
   300 ms, which on localhost it will not.

### Generated API types

```
FastAPI app ──app.openapi()──▶ frontend/src/core/api/openapi.json
                                   │ openapi-typescript
                                   ▼
                     frontend/src/core/api/schema.d.ts   (committed, never edited)
```

- `scripts/gen_api.py` imports `create_app()` and dumps the schema without
  starting a server, then runs `openapi-typescript`.
- `check.py` regenerates into a temporary location and fails if the result
  differs from the committed file (drift check).
- Modules alias the generated types and never redeclare them:
  `export type Todo = components['schemas']['TodoOut']`.
- FastAPI's `generate_unique_id_function` produces readable operation IDs
  (`todos_create_item`).

### Routing and app shell

- TanStack Router with code-based routes, assembled in `app/router.tsx` from
  every manifest's `routes()`. Search params are typed and validated.
- The detail panel is driven by `?item=todos.todo:<id>`. It can be deep
  linked, works with Back, and the owning module renders it.
- Shell: collapsible sidebar (nav items from the manifests) | main |
  optional detail panel | optional rail pane | icon rail (from manifests'
  `rail`). The pane sits inline from 1280 px, floats over the content
  between 768 and 1280 px; below 768 px the rail icons move to the top bar
  and the pane fills the screen. The open pane is remembered per browser.
  - Width ≥ 1280 px: all three columns.
  - 768–1279 px: the detail panel overlays.
  - Under 768 px: the sidebar becomes a drawer and the detail panel a
    full-screen sheet.
- Global hosts live in `core`: command palette (Ctrl+K), quick-add (Q),
  toasts/undo, keyboard shortcut registry, theme. Modules contribute through
  the manifest.

### Undo

`core/undo` keeps a bounded stack. Every user action pushes its inverse:
deletes show a toast with "Undo", while completing, moving and re-dating
push silently. Ctrl+Z pops the newest entry. Undo runs a normal mutation
(restore, reopen, or a move back between the previous neighbours), so it is
optimistic too.

### Drag and drop

One `DndRoot` (in `ui/`) wraps the shell, so todos can be dropped onto
sidebar lists. Every draggable carries its own `onDragEnd` in its data, and
`DndRoot` calls it with a library-neutral `DropInfo`. Modules turn that into
a move with pure, tested rules (`modules/todos/dropRules.ts`):
- the target's data names its container and the ids shown there
- the new index picks the neighbours
- the move goes through the same optimistic mutation as Alt+↑/↓

Groups (`todos:<list>:<section>:<parent>`) keep subtasks inside their
parent. Lists are grouped per area and sections per list.

`DndRoot` also reconfigures dnd-kit's pointer sensor. By default it never
starts a drag on a link, and sidebar rows (lists, collections) are links.
A link inside the dragged element may start a drag, but with a mouse only
after 5 px of movement, so a slow click still navigates.

### Todo UI state

Selection, expanded parents, todos "lingering" for 600 ms after completion
(motion rule 4) and pending pickers (D / V) live in a tiny external store
(`modules/todos/uiStore.ts`). The views, the detail panel and the module
Host share it, and none of them is an ancestor of the others.

Each view's "Completed today" group starts collapsed. Opening it is
remembered per view (`inbox`, `today`, `list:<id>`) in the same store, so it
survives navigating away and back. The store is memory only, so a restart
collapses every group again.

### Calendar module (phase 4, brought forward)

- Tables `calendar_events` (timed: UTC `start_at`/`end_at`; all-day:
  floating `start_date`/`end_date`, end inclusive; optional `rrule`) and
  `calendar_exceptions` (skipped occurrences keyed by local start date).
- `GET /api/calendar/events?start=&end=` expands series server-side in the
  configured zone (python-dateutil + tzdata), max 100 days. PATCH/DELETE
  take `scope` = `all` | `this` | `following` plus `occurrence_date`;
  `this` adds an exception and a detached event, `following` cuts the
  series with UNTIL and starts a new one (`split_id` lets the client name it).
- The frontend caches per calendar month (`['calendar','month','YYYY-MM']`).
  Mutations patch every cached month optimistically, then refetch, since
  only the server expands recurrence exactly.
- The rule engine (`backend/planbox/core/recurrence.py`) and the repeat
  editor (`frontend/src/core/recurrence/`) moved to core when todos started
  repeating, so both modules use them without importing each other.

## 9. Runtime topology

| Mode | Processes | Origin |
|---|---|---|
| Dev | uvicorn `--reload` on 127.0.0.1:8000 and Vite on 127.0.0.1:5173 (`/api` proxied) | 5173 |
| Daily use, runtime-only PC (release zip) | Same as daily use, serving the prebuilt `frontend/dist` from the zip; no Node.js | 8765 |
| Daily use (`main.py` → `scripts/serve.py`) | One in-process uvicorn on 127.0.0.1:8765 serving `/api` and the built `frontend/dist` (SPA fallback). It can be stopped from the app. | 8765 |
| Later (PWA) | The same single process, bound to the private-network interface behind auth. A deliberate change, not a flag. | n/a |

The server is single-origin in production, so the future PWA (service
worker, manifest) needs no CORS. The dev server sends no CORS headers either,
because Vite proxies.

### Install modes

`scripts/_common.py` decides between two install modes. Both run the same
code against the same database.

- **dev:** npm is on PATH and `frontend/package.json` exists (a git
  checkout). `.venv` gets an editable install with the dev group, constrained
  by `requirements.lock.txt`. `serve.py` rebuilds `frontend/dist` when its
  sources are newer.
- **runtime:** no npm, or no frontend sources (a release zip). `.venv` gets
  only `pip install -r requirements.lock.txt`, with no build step and no
  editable install (the scripts put `backend/` on `sys.path`). `serve.py`
  serves `frontend/dist` as it is. It refuses to start without one, and
  warns when a dev checkout's `dist` lacks `BUILD_INFO.json` (it may be
  stale).

`.venv/planbox-install.json` records the mode and the lock file's hash.
`main.py` reruns setup only when they no longer match.

The release zip (`scripts/package.py`) is built from an allowlist: root
files, `backend/planbox`, the runtime scripts and a source-map-free
`frontend/dist` carrying `BUILD_INFO.json`. A verify step rejects
`private_data`, `.venv`, `node_modules`, tests and source maps, so
extracting a newer zip over an install keeps the data.

### Local-server protections

Binding to 127.0.0.1 stops other machines, but not websites open in your own
browser. Two cheap guards cover that:

- **Host check.** Starlette's `TrustedHostMiddleware` accepts only
  `127.0.0.1` and `localhost` as the `Host` header. This defeats DNS
  rebinding, where a site points its own domain at 127.0.0.1 to read or
  change local data. When the PWA arrives (phase 7) the private-network name
  is added here, together with authentication.
- **JSON-only mutations.** Write endpoints take JSON bodies. Browsers cannot
  send `application/json` cross-site without a CORS preflight, which we
  never answer. FastAPI rejects form-encoded or `text/plain` bodies for
  JSON models (422). There is a test for this on `/api/shutdown`.

### Shutdown

`main.py` (via `serve.py`) runs uvicorn in-process and passes
`create_app(request_shutdown=...)` a hook that sets `server.should_exit`.
`POST /api/shutdown {"confirm": true}` schedules that hook as a background
task, so the 202 response reaches the browser before the server stops.
`GET /api/meta` reports `can_shutdown`. Only launcher-started servers offer
the power button; the dev server is stopped by `dev.py`. After a successful
shutdown the frontend replaces the shell with a "PlanBox has stopped" screen.

### App window

A page cannot close its own tab once it has navigated (browsers allow
`window.close()` only for script-opened windows or a single history entry),
and never the browser. So `serve.py --open` (`scripts/app_window.py`) starts
Chrome, else Edge, in app mode (`--app=<url>`, one window without tabs) with
its own profile in `<data_dir>/browser`. That makes it a separate browser
process the launcher owns. When the server stops (power button or Ctrl+C),
the launcher closes it gracefully (`taskkill` without `/F`, so there is no
"restore pages" prompt) and kills it only if it is still open after 5 s.
The other way round, a thread waits on the window's process and stops the
server when it exits (the user closed the window). An exit within 3 s of
launch is ignored: that is the browser handing the URL to an instance of the
same profile that is already running (a window left over from earlier).
Without Chrome/Edge, or with `BROWSER` set (tests use `BROWSER=echo`), it
opens the default browser instead, and the stopped screen stays as the
fallback. Browser-local state such as the theme lives in that profile.

## 10. Module recipe (learned from todos)

To add a module `notes`, do the following. Nothing outside these places
changes.

1. **Backend** `backend/planbox/modules/notes/`:
   - `migrations/0001_….sql`: tables prefixed `notes…` with `id`,
     `created_at`, `updated_at` and `deleted_at`. `STRICT`, with partial
     unique indexes on live rows.
   - `models.py` (frozen dataclasses), `repository.py` (SQL only),
     `service.py` (rules, `with transaction(...)`, domain errors),
     `schemas.py` (Pydantic, client ids allowed), `router.py` (thin).
   - `__init__.py` exports `module = Module(id="notes", …, entity_types=…)`.
   - Add one line to `planbox/modules/__init__.py`.
   - Tests: API tests per endpoint, plus the invariants and cascades. The
     boundary test already checks imports and tables.
2. **API types:** `py scripts\gen_api.py`.
3. **Frontend** `frontend/src/modules/notes/`:
   - `types.ts` (aliases of generated types), `queries.ts` (keys and
     queries), `mutations.ts` (optimistic, one serial scope), `apply.ts` and
     `selectors.ts` (pure, tested), actions with undo, pages, and a `Host`
     for commands and shortcuts.
   - `index.ts` exports the manifest. Add one line to `src/modules/index.ts`.
   - To take part in links: publish a linkable source from the Host
     (`useLinkableSource`) and render `<LinkedItems>` in the detail panel.
   - To take part in search: give the backend `EntityType` a `documents`
     function (rows changed since an instant) and a `hint` in `summarize`.
     Make sure every write bumps `updated_at`.
   - UI flow tests with a fake API, plus one or two Playwright smoke tests.

## 11. Continuous integration

`.github/workflows/ci.yml` runs on every push:
- **Backend** on Windows with Python 3.12.10 and 3.14: Ruff, pyright, the
  lock check, pytest.
- **Runtime-only install** on 3.12.10 with stock pip: installs the lock and
  builds the app.
- **Frontend** on Node 24: Prettier, ESLint, tsc, Vitest, plus the API type
  drift check.
- **Playwright** smoke suite.

`release.yml` runs on `v*` tags: it checks the tag against the app version,
runs `package.py` and attaches the zip to a GitHub release.

## 12. Testing architecture

| Layer | Tool | Database |
|---|---|---|
| Repositories | pytest | temporary file DB with all migrations applied (`tmp_path`) |
| Services | pytest, fixed clock | same |
| API | pytest + FastAPI `TestClient` (httpx) | same, app built by `create_app(settings)` |
| Migrations | pytest | fresh DB, plus checksum and directive tests |
| Boundaries | pytest (ast) | n/a |
| Frontend logic (selectors, parser, ordering, shortcuts) | Vitest | n/a |
| Key components | Vitest + React Testing Library + jsdom | fetch injected into the API client |
| Smoke (from the end of phase 1) | Playwright, Chromium only | `serve.py`-style process on a temporary data dir |
