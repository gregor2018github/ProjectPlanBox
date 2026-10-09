# Plan

Every phase ends with the same steps: `py scripts\check.py` is green, the
docs are updated, and there is a short report (what was built, what was
deferred, what diverged from the plan).

## Phase 0: Foundation (no features). Done 2026-10-08

**Goal:** the empty app runs, looks and feels right, and every pipeline that
later phases depend on is in place and tested.

### Backend
1. `pyproject.toml`: Python 3.14, exact pins, a `dev` dependency group, and
   Ruff, pyright (strict) and pytest config.
2. `config.py`: a `Settings` frozen dataclass built from defaults, then
   `private_data/settings.toml` (stdlib `tomllib`), then `PLANBOX_*` env vars
   (data dir, timezone, port, mode).
3. `core/db`: a connection factory with pragmas (WAL, foreign keys,
   busy_timeout, synchronous=NORMAL), a `transaction()` context manager and
   a request-scoped connection dependency.
4. `core/db/migrations.py`: the runner. Per-owner sequences, a
   `schema_migrations` table, SHA-256 checksums (refuse on mismatch), one
   transaction per file, the `foreign_keys=off` directive, and a
   `VACUUM INTO` backup before pending migrations (keeps 10). Tested with
   fixture migration folders.
5. `core/ids.py` (UUIDv7), `core/clock.py`, `core/errors.py` (problem+json
   handler), `core/module.py`, `core/entities.py` (registry, no entity types
   yet).
6. `main.py`: `create_app(settings)`. The lifespan runs migrations. It mounts
   the core routers, then each module router at `/api/{id}`. In serve mode it
   serves `frontend/dist` with an SPA fallback. It binds to 127.0.0.1 only
   (enforced in `serve.py`/`dev.py`, not configurable).
7. `GET /api/health` (status, applied migrations per owner) and
   `GET /api/meta` (app version, timezone, week start).
8. `tests/test_boundaries.py` (import and table-prefix rules), already
   passing with zero modules.

### Frontend
9. A Vite + React + TS strict scaffold. ESLint flat config (including the
   module-boundary and "no Base UI outside `ui/`" rules), Prettier, Vitest +
   RTL + jsdom.
10. `styles/tokens.css` with the full token set from STYLE_GUIDE (light and
    dark), the Tailwind v4 `@theme inline` mapping, and the token contrast
    test.
11. Theme: `system | light | dark` switch, the inline no-flash bootstrap in
    `index.html`, live `prefers-color-scheme`.
12. The `ui/` primitives the shell needs: Button, IconButton, Tooltip, Kbd,
    Dialog, Menu, Toast host, `motion.ts` presets, `<MotionConfig
    reducedMotion="user">`.
13. App shell: collapsible sidebar (`[` toggles it and the state persists),
    drawer below `md`, main area, and the detail-panel slot (empty, opened
    via `?item=`). The module registry and router assembly work with zero
    modules. There are no placeholder module screens. The main area shows a
    neutral "PlanBox" home.
14. Core hosts: the shortcut registry (`useShortcut`, a scoped "not in text
    input" guard, a `?` overlay listing registered shortcuts) and the command
    palette (Ctrl+K) with core commands only: toggle theme, toggle sidebar,
    show shortcuts.
15. API pipeline: `scripts/gen_api.py` → `openapi.json` → `schema.d.ts`; an
    `openapi-fetch` client; a typed `getHealth` hook used by a small
    connection indicator in the sidebar footer (green dot / "Server
    unreachable"). This proves the pipeline end to end.
16. `core/ids.ts` (UUIDv7) and `core/time.ts` (today in the configured zone,
    Monday-start weeks), with tests.

### Scripts and docs
17. `scripts/setup.py`, `dev.py`, `test.py`, `check.py` (including the API
    drift check), `gen_api.py`, `serve.py`, `migrate.py`. Windows-first
    (they call `.venv\Scripts\python.exe` directly) but written in plain
    Python, so they would also run elsewhere.
18. `.gitignore` (`.venv/`, `private_data/`, `frontend/node_modules/`,
    `frontend/dist/`, …), `.gitattributes` (`* text=auto eol=lf`, which stops
    the CRLF warnings from the first commit), `.editorconfig`, VS Code
    recommended settings/extensions.
19. README, ARCHITECTURE and STYLE_GUIDE updated to match reality.

**Added after phase 0 (owner request):** `main.py` launcher (first-run
setup, rebuild if stale, open the browser, detect a running instance), a
shutdown button and palette command (`POST /api/shutdown`, launcher-only),
and the loopback `Host` check that the shutdown endpoint made necessary.
Later (owner request): the launcher opens PlanBox in its own Chrome/Edge app
window, closes it on shutdown, and shuts down when it is closed
(`scripts/app_window.py`, ARCHITECTURE §9).

**Done when:** `setup.py` on a fresh clone and then `dev.py` gives a themed,
responsive, keyboard-navigable empty shell showing a live health indicator;
`serve.py` serves the same from one port; `check.py` is green; and the
migration runner has tests for ordering, checksum refusal, rollback on
failure, backup and the directive.

## Phase 1: Todos (the reference vertical slice). Done 2026-10-08

**As built, differences from the plan below:**
- Drag and drop wraps `@dnd-kit/react` + `@dnd-kit/dom` in `ui/dnd.ts` and
  `ui/DndRoot.tsx` (not a `ui/Sortable` component). Each dragged item carries
  its own drop handler. dnd-kit's Accessibility plugin is turned off because
  it made every row a `role="button"` around the row's own buttons. Keyboard
  reordering is Alt+↑/↓ and "Move to…" (V), not dnd-kit's keyboard sensor.
- Todo routes live under `/todos/…`, and `/` redirects to `/todos/today`
  (the manifest's `homePath`).
- The tag and move-to pickers use our own `ui/PickerList` inside a Popover
  rather than Base UI's Combobox. This keeps "create on Enter" simple.
- Logbook rows can be reopened but not opened in the detail panel, because
  completed todos from earlier days are not in the shared cache.
- The generated API types use `--default-non-nullable false`, so fields
  with server defaults stay optional in request bodies.

This slice sets the pattern every later module copies. Each step lands with
its tests. Adding areas, sections and subtasks (decision 2) makes this phase
noticeably bigger than first sketched. I'll report at the end of each
milestone 1a–1f, not just at the end of the phase.

### 1a. Backend
- `core/ordering.py`: fractional index keys, plus
  `shared/ordering-vectors.json` used by both pytest and Vitest.
- Core tags: migration, repository, service (`set_tags(ref, ids)`,
  case-insensitive unique names), router, tests.
- Todos: migration (`todos_areas`, `todos_lists`, `todos_sections`,
  `todos`), models, repository, service and router per ARCHITECTURE §7. This
  covers idempotent create with a client-sent id, PATCH with absent-vs-null
  handling, complete/reopen (cascading to subtasks), one `move` for reorder,
  re-home and indent/outdent with all hierarchy invariants checked, soft
  delete/restore cascading down the hierarchy with a shared `deleted_at`, and
  the logbook. Registers the `todos.todo` entity type.
- Tests: repository and service against a temp DB, API tests for every
  endpoint including the error shapes.

### 1b. Frontend data layer
- `modules/todos/types.ts` (aliases of generated types), `api.ts` (query
  options, a key factory, mutation hooks with `scope: 'todos'`),
  `applyTodoPatch`/`applyTodoMove` (mirroring the server's invariants), and
  selectors (inbox; today = overdue + due today + completed today; upcoming
  grouped by day; per area; per list grouped by section with nested
  subtasks; counts for the sidebar).
- The undo stack in `core` (toast "Undo" and Ctrl+Z).
- Tests for selectors, the optimistic apply/rollback (fetch failure →
  snapshot restored), and ordering parity.

### 1c. Views and editing
- Sidebar nav: Inbox, Today, Upcoming and Logbook, then lists outside any
  area, then collapsible areas containing their lists. Create, rename,
  reorder and delete (with undo) areas and lists. Open counts.
- List view: unsectioned todos first, then sections as headings (create,
  rename, delete, collapse). `TodoRow` shows checkbox, title, due, priority,
  tags and a subtask progress (`2/5`) that expands the subtasks inline.
  There is an inline "new todo" row per section and a completed-today group.
- Area view: its lists, each with its open todos (read-only grouping, links
  to the list).
- Detail panel: title, notes (plain textarea that autosaves with a debounce;
  Markdown rendering is deferred), due date picker (a popover with quick
  picks Today/Tomorrow/Next Monday/None and a Monday-start month grid built on
  date-fns), priority menu, a list/section picker, tag combobox (create on
  Enter), a subtask checklist (add, complete, reorder, promote to todo), and
  delete.
- Today (overdue group first) and Upcoming (grouped by day: "Tomorrow",
  "Mon 13 Oct", …) views. They are auto-sorted (decision 3). Subtasks show
  their parent's title as context.
- Motion: row enter/exit, completion per STYLE_GUIDE B1 rule 4, layout
  springs.

### 1d. Reordering
- Drag and drop via `ui/Sortable` (wrapping `@dnd-kit/react`), with
  pointer, touch and keyboard sensors:
  - todos within and across sections
  - subtasks within their parent
  - sections within a list
  - lists within and across areas in the sidebar
  - dropping a todo onto a sidebar list or the Inbox moves it there

  Dragging is disabled in Today/Upcoming, which are auto-sorted.
- Keyboard: Alt+↑ / Alt+↓ moves the selection. Alt+→ makes it a subtask of
  the todo above (indent) and Alt+← promotes it (outdent).

### 1e. Keyboard and quick-add
- Global quick-add (`Q`, or the palette's "New todo") opens a dialog that
  parses as you type and shows the result as chips: `tomorrow`, `fri`,
  `next week`, `in 3 days`, `12.10`, `2026-10-12` → due; `!1`/`!2`/`!3` →
  priority (high/medium/low); `#list` or `#list/section` → placement;
  `@tag` → tag. The parser is pure and tested. When a todo is selected,
  `Shift+Q` opens quick-add for a subtask of it.
- Palette commands from the module (go to Today/Upcoming/Inbox/Logbook/any
  area or list; new todo/subtask/section/list/area; move to…) plus
  client-side todo search by title.

| Key | Action (in list views; not while typing) |
|---|---|
| `Ctrl+K` | Command palette |
| `Q` / `Shift+Q` | Quick-add todo / subtask of the selection |
| `↑`/`↓` or `K`/`J` | Move selection |
| `Enter` | Open in the detail panel / edit title |
| `Space` or `X` | Complete / reopen |
| `Alt+↑`/`Alt+↓` | Move up/down |
| `Alt+→`/`Alt+←` | Indent (make subtask) / outdent |
| `→`/`←` | Expand/collapse subtasks or section |
| `V` | Move to list/section… (picker) |
| `1` `2` `3` `0` | Priority high / medium / low / none |
| `T` / `M` / `D` | Due today / tomorrow / pick date |
| `Delete` | Delete (undoable) |
| `Ctrl+Z` | Undo the last delete/complete/move |
| `G` then `I`/`T`/`U`/`L` | Go to Inbox / Today / Upcoming / Logbook |
| `[` / `]` | Toggle sidebar / detail panel |
| `Esc` | Close panel or dialog, clear selection |
| `?` | Shortcut overview |

### 1f. Smoke suite and wrap-up
- **Playwright comes in here.** Phase 0 has nothing worth driving in a
  browser. From now on the suite should guard the slice every module copies.
  It runs Chromium only against a real backend on a temp data dir, with 5–6
  tests: quick-add with parsing → shows in Today; complete + undo; drag
  reorder survives reload; indent to subtask and complete the parent; edit in the detail panel; theme switch; 375 px
  viewport smoke. It runs via `py scripts\test.py --e2e` and is part of
  `check.py --full`. It stays out of the default fast loop.
- A "module recipe" section in ARCHITECTURE: the checklist for adding a
  module, derived from what todos actually needed.

**Done when:** all of the above is usable daily via `serve.py`, every
mutation is optimistic with a tested rollback, and `check.py --full` is
green.

## Side task: Python 3.12 minimum and a runtime-only install (2026-10-10)

An owner-approved task outside the phase order. No module work was done.

**Why 3.12 became the minimum.** The owner wants to run PlanBox on a work PC
that has only Python 3.12 and pip, and where neither Node.js nor another
Python can be installed. The code used only four 3.14 conveniences:
- `uuid.uuid7()`, replaced by our own thread-safe, strictly increasing
  UUIDv7 in `core/ids.py`
- an unparenthesised multi-exception `except`
- two self-referencing annotations
- methods named `list` shadowing the builtin inside class bodies

A compatibility layer would have meant two code paths to test forever, so
3.12 became the floor. The Ruff and pyright targets are 3.12, so the
quality gate rejects 3.14-only code from now on. `from __future__ import
annotations` was deliberately *not* added everywhere: pyright on 3.12
already catches every such case, and the import would make FastAPI and
Pydantic resolve string annotations at runtime.

**What was added:**
- `requirements.lock.txt` (`scripts/lock.py`): every runtime package at an
  exact version, resolved on 3.12, used by both install modes and CI.
- A runtime-only install path (no Node.js) through `main.py` and
  `setup.py`.
- `scripts/package.py` and the release zip.
- CI on Python 3.12.10 and 3.14 with Node 24, plus releases from `v*` tags.

## Later phases (sketch)

- **Phase 2: Knowledge collections.** Collections of notes, links and
  snippets, and the first build of core **links** (todo ↔ note) since there
  are now two modules.
- **Phase 3: Search.** Core FTS5 index fed by todos and knowledge, plus
  palette integration.
- **Phase 4: Calendar.** Events (timed instants and all-day floating dates)
  with RRULE expansion server-side, and todos with due dates shown in the
  calendar.
- **Phase 5: Habits.** Habits with schedules (RRULE) and daily check-ins
  stored as floating dates, plus streaks.
- **Phase 6: Recurring todos.** `rrule` on todos, with next-occurrence on
  completion, reusing phase 4's recurrence code.
- **Phase 7: Mobile PWA.** Manifest and service worker, binding to the
  private network interface, authentication, and a touch polish pass.
- **Phase 8: Data safety and sync.** Scheduled backups, export/import, and
  sync design using the existing UUIDv7 IDs, timestamps and tombstones.

---

## Dependencies

All versions were checked against PyPI and npm on **2026-10-08** and will be
pinned exactly.

### Runtimes

| Runtime | Pick | Note |
|---|---|---|
| Python | **3.12 minimum**; 3.14.8 on the home PC, 3.12.10 on the work PC | 3.12 became the minimum on 2026-10-10 (see the side task above). 3.12.10 is the last 3.12 with a python.org Windows installer and bundles SQLite 3.49.1 (STRICT tables and FTS5 work). |
| Node.js | **24 LTS** (you have 24.15; latest 24.21) | Vite 8 needs ≥ 20.19. Node 26 becomes LTS on 2026-10-28, and we can move later. |
| SQLite | 3.49.1 (bundled with CPython) | FTS5 confirmed available |

### Python: from the brief

| Package | Version | |
|---|---|---|
| fastapi | 0.143.0 | Released today. Pinned. If anything misbehaves, fall back to the previous patch. |
| pydantic | 2.14.0 | Comes with FastAPI. Pinned explicitly because we import it directly. Released today. |
| uvicorn | 0.54.0 | ASGI server. Plain install, not `[standard]`: uvloop does not exist on Windows and we do not need httptools. |
| ruff | 0.16.10 | dev |
| pyright | 1.1.414 | dev. Chosen over mypy because it is the same engine as Pylance in VS Code, so the editor and the gate agree. It downloads its Node runtime on first run. |
| pytest | 9.1.1 | dev |

### Python: beyond the brief

| Package | Version | Justification |
|---|---|---|
| httpx | 0.28.1 | dev. FastAPI's `TestClient` needs it. **Open question:** Starlette 1.7 (pulled in by FastAPI 0.143) now prefers its successor `httpx2` (2.13.1, maintained by the Pydantic team) and warns about `httpx`. We kept the agreed `httpx`, filtered that one warning in pytest, and relaxed pyright's "unknown type" rules for `backend/tests` only. Switching is a one-line change once approved (see TODO.md). |
| python-dateutil | 2.9.0.post0 | **Phase 4/6 only**, not installed earlier. Evaluates RFC 5545 RRULEs. Correct recurrence expansion (BYSETPOS, DST, EXDATE) is a deep rabbit hole. It is mature and widely used, but updated rarely. |

Considered and **not** used: SQLAlchemy/SQLModel (see ARCHITECTURE §3),
pydantic-settings (a 30-line dataclass does the job), uuid6 (stdlib in 3.14;
if we stay on 3.13 I write the 15 lines myself), pytest-cov (can be added
when coverage numbers matter).

### Frontend: from the brief

| Package | Version | Note |
|---|---|---|
| react, react-dom | 19.3.0 | **Published today.** If the ecosystem has problems, fall back to 19.2.8. |
| vite | 8.3.4 | |
| @vitejs/plugin-react | 6.1.2 | |
| typescript | **5.9.3** (not 7.0.2) | TS 7.0 (the native Go compiler) is `latest`, but `typescript-eslint` 8.71 supports TS < 6.1 and `openapi-typescript` declares `^5.x`. 5.9.3 satisfies both without peer overrides. We move up when the lint toolchain supports TS 7. |
| tailwindcss, @tailwindcss/vite | 4.3.3 | |
| @base-ui/react | 1.8.0 | Headless primitives, chosen over Radix (see below). |
| motion | 14.0.0 | Imported from `motion/react` |
| @tanstack/react-query | 5.104.1 | |
| openapi-typescript | 7.13.0 | dev. Generates `schema.d.ts`. |
| vitest | 5.0.3 | dev |
| @testing-library/react / dom / user-event / jest-dom | 16.3.3 / 10.4.2 / 14.6.7 / 7.0.1 | dev |
| jsdom | 30.1.2 | dev, the Vitest environment |
| eslint, @eslint/js | 10.12.0 / 10.0.1 | dev |
| typescript-eslint | 8.71.1 | dev |
| eslint-plugin-react-hooks | 7.1.1 | dev |
| @playwright/test | 1.64.0 | dev, phase 1f |
| @types/react, @types/react-dom | 19.3.0 | dev |

**Base UI vs. Radix:** both are viable (radix-ui 1.7.0 shipped today too).
I pick Base UI because it is actively developed by the MUI team with
dedicated staff. It has the components we need that Radix lacks or splits
out (**Combobox**/Autocomplete for tags and the palette, Toast, Context
Menu). It also uses a cleaner `render` prop composition model. If you prefer
Radix, the cost of switching is limited to `src/ui/`.

### Frontend: beyond the brief

| Package | Version | What, why not ours, maintenance |
|---|---|---|
| openapi-fetch | 0.17.0 | A 6 KB typed `fetch` driven by the generated `paths` type. The type-level path/param/body inference is hard to write well. It comes from the openapi-typescript project, active (June 2026), but is still 0.x. |
| @tanstack/react-router | 1.170.41 | Routing with typed, validated search params (the detail panel `?item=`, filters). We need nested layouts, history and URL state. It pairs with Query. Very active. Code-based routes, so no codegen plugin. |
| @dnd-kit/react, @dnd-kit/dom | 0.5.0 | Drag and drop with pointer and touch sensors, sortable groups and cross-container moves, which is a serious amount of work to do well. `dom` is pinned only to configure its plugins. **Caveat:** it is the new 0.x API, actively released (Sept 2026), while the stable `@dnd-kit/core` 6.3.1 has had no release since Dec 2024. Lint confines it to `src/ui/` so a swap stays local. (`@dnd-kit/helpers` was planned but not needed.) |
| date-fns, @date-fns/tz | 4.4.0 / 1.5.0 | Date arithmetic, Monday-start weeks, formatting in a named zone, for "today", Upcoming grouping and the date picker. Calendar maths is a classic bug source. Actively maintained. These are also optional peers of Base UI. (`Temporal` is not yet usable on every target browser, including iOS Safari for the future PWA.) |
| lucide-react | 1.53.0 | The icon set (tree-shaken). We don't draw icons. Very active. |
| prettier | 3.9.9 | dev. Formats TS/CSS/JSON (ESLint no longer formats). The JS equivalent of the Ruff formatter. Active. |
| eslint-plugin-jsdoc | 65.2.0 | dev. Enforces the "JSDoc on exports" rule from the brief. Active. |
| eslint-plugin-react-refresh | 0.5.7 | dev. Keeps Vite HMR working (component-only exports). Active. |

Considered and **not** used: `cmdk` (the palette is Base UI Dialog +
Autocomplete plus a small fuzzy scorer; cmdk's last release was Aug 2025),
`clsx`/`cva`/`tailwind-merge` (a 5-line `cx()` and typed variant maps), a
hotkeys library (the shortcut registry is about 100 lines and needs our
"scope + not-in-input" semantics), MSW (we inject `fetch` into the API
client in tests), `fractional-indexing` (we need a Python twin anyway, and
shared test vectors guarantee parity), `concurrently` (`dev.py` does process
management in plain Python), React Compiler (revisit when its Vite 8 setup
is simpler).

---

## Decisions (owner, 2026-10-08)

1. **Python 3.14.8** (the minimum is now 3.12, see the side task). Installed per-user from the signed python.org
   installer (winget only had 3.14.7). `py -3.14` works. Its bundled SQLite
   is 3.50.4, with FTS5.
2. **Areas, sections and subtasks are in phase 1.** Data model in
   ARCHITECTURE §7.
3. **Today/Upcoming ordering:** you're indifferent, so they **auto-sort**
   (overdue first, then priority, then list position). It is the simpler
   model, and manual order there can be added later without touching
   existing tables (a per-view position table).
4. **Due dates are date-only.** Times arrive with the calendar.
5. **English** UI and quick-add keywords. Dates display as `Wed 8 Oct` and
   `8 Oct 2026`, with 24-hour time.
6. **Design is my call.** I keep the system font stack: Segoe UI Variable is
   native, superbly hinted on Windows 11, and needs no font dependency, and
   the future PWA gets SF/Roboto natively. I also keep the single
   indigo-blue accent (`oklch(0.55 0.19 264)`). It is calm and professional,
   distinct from the red/amber semantic marks, and contrast-tested in both
   themes.
7. **`private_data/` holds everything that must not leave the PC**: the
   real DB, `settings.toml`, backups and the dev DB (`private_data/dev/`).
8. **The shortcut set is approved** and extended for the hierarchy (see the
   phase 1 table).
9. **`@dnd-kit/react` 0.5.0** (the new API), wrapped in `ui/dnd.ts`.
10. **Pin versions released today** (React 19.3.0, FastAPI 0.143.0, Pydantic
    2.14.0), with fallbacks: React 19.2.8, and the previous FastAPI/Pydantic
    patches.
11. **Connectors later.** Tracked in [TODO.md](TODO.md).

## Remaining assumptions

1. Todos live in a list or the Inbox, never directly in an area. Areas group
   lists only.
2. Subtasks are one level deep. Sections exist only in lists, not in the
   Inbox.
3. Deleting any container (area, list, section, parent todo) soft-deletes
   everything below it, and a single undo restores it all. There is no
   confirmation dialog because it is undoable.
4. Completed todos stay visible, struck through, for the rest of the day,
   then move to the paginated Logbook.
5. Notes on a todo are plain text in phase 1. Markdown rendering is deferred.
6. There is no trash view in phase 1 (undo covers it). Purging waits until
   sync is designed.
7. The daily-use server runs on port 8765, separate from dev (8000/5173), so
   both can run at the same time. Autostart at login is not in scope yet.
8. The theme preference is stored in the browser (`localStorage`) so it
   applies before first paint. It moves to `settings.toml`/the server when
   the PWA needs it on several devices.
9. The `master` branch is used as is. I commit only when you ask.
