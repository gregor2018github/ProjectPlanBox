# Plan

Every phase ends with the same steps: `py scripts\check.py` is green, the
docs are updated, and there is a short report (what was built, what was
deferred, what diverged from the plan).

## Phase 0: Foundation (no features)

**Goal:** the empty app runs, looks and feels right, and every pipeline that
later phases depend on is in place and tested.

### Backend
1. `pyproject.toml`: Python 3.14, exact pins, a `dev` dependency group, and
   Ruff, pyright (strict) and pytest config.
2. `config.py`: a `Settings` frozen dataclass from env vars (data dir,
   timezone, port, mode).
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
18. `.gitignore` (`.venv/`, `var/`, `frontend/node_modules/`,
    `frontend/dist/`, …), `.editorconfig`, VS Code recommended
    settings/extensions.
19. README, ARCHITECTURE and STYLE_GUIDE updated to match reality.

**Done when:** `setup.py` on a fresh clone and then `dev.py` gives a themed,
responsive, keyboard-navigable empty shell showing a live health indicator;
`serve.py` serves the same from one port; `check.py` is green; and the
migration runner has tests for ordering, checksum refusal, rollback on
failure, backup and the directive.

## Phase 1: Todos (the reference vertical slice)

This slice sets the pattern every later module copies. Each step lands with
its tests.

### 1a. Backend
- `core/ordering.py`: fractional index keys, plus
  `shared/ordering-vectors.json` used by both pytest and Vitest.
- Core tags: migration, repository, service (`set_tags(ref, ids)`,
  case-insensitive unique names), router, tests.
- Todos: migration (`todos_lists`, `todos`), models, repository, service and
  router per ARCHITECTURE §7. This covers idempotent create with a
  client-sent id, PATCH with absent-vs-null handling, complete/reopen,
  move (`before_id`/`after_id`, across lists), soft delete/restore (a list
  cascades with a shared `deleted_at`), and the logbook. Registers the
  `todos.todo` entity type.
- Tests: repository and service against a temp DB, API tests for every
  endpoint including the error shapes.

### 1b. Frontend data layer
- `modules/todos/types.ts` (aliases of generated types), `api.ts` (query
  options, a key factory, mutation hooks with `scope: 'todos'`),
  `applyTodoPatch`, and selectors (inbox, today = overdue + due today +
  completed today, upcoming grouped by day, per list, counts for the
  sidebar).
- The undo stack in `core` (toast "Undo" and Ctrl+Z).
- Tests for selectors, the optimistic apply/rollback (fetch failure →
  snapshot restored), and ordering parity.

### 1c. Views and editing
- Sidebar nav: Inbox, Today, Upcoming, then lists (create, rename, reorder,
  delete with undo), with open counts.
- List view: `TodoRow` (checkbox, title, due/priority/tag metadata),
  inline "new todo" row, completed-today section.
- Detail panel: title, notes (plain textarea that autosaves with a debounce;
  Markdown rendering is deferred), due date picker (a popover with quick
  picks Today/Tomorrow/Next Monday/None and a Monday-start month grid built on
  date-fns), priority menu, list select, tag combobox (create on Enter),
  delete.
- Today (overdue group first) and Upcoming (grouped by day: "Tomorrow",
  "Mon 13 Oct", …) views.
- Motion: row enter/exit, completion per STYLE_GUIDE B1 rule 4, layout
  springs.

### 1d. Reordering
- Drag and drop within a list via `ui/Sortable` (wrapping dnd-kit), with
  pointer, touch and keyboard sensors. Dropping onto a sidebar list moves the
  todo there. Dragging is disabled in Today/Upcoming, which are auto-sorted.
- Keyboard: Alt+↑ / Alt+↓ moves the selected todo.

### 1e. Keyboard and quick-add
- Global quick-add (`Q`, or the palette's "New todo") opens a dialog that
  parses as you type and shows the result as chips: `tomorrow`, `fri`,
  `next week`, `in 3 days`, `12.10`, `2026-10-12` → due; `!1`/`!2`/`!3` →
  priority (high/medium/low); `#list` → list; `@tag` → tag. The parser is
  pure and tested.
- Palette commands from the module (go to Today/Upcoming/Inbox/list, new
  todo, new list) plus client-side todo search by title.

| Key | Action (in list views; not while typing) |
|---|---|
| `Ctrl+K` | Command palette |
| `Q` | Quick-add todo |
| `↑`/`↓` or `K`/`J` | Move selection |
| `Enter` | Open in the detail panel / edit title |
| `Space` or `X` | Complete / reopen |
| `Alt+↑`/`Alt+↓` | Move up/down |
| `1` `2` `3` `0` | Priority high / medium / low / none |
| `T` / `M` / `D` | Due today / tomorrow / pick date |
| `Delete` | Delete (undoable) |
| `Ctrl+Z` | Undo the last delete/complete/move |
| `G` then `I`/`T`/`U` | Go to Inbox / Today / Upcoming |
| `[` / `]` | Toggle sidebar / detail panel |
| `Esc` | Close panel or dialog, clear selection |
| `?` | Shortcut overview |

### 1f. Smoke suite and wrap-up
- **Playwright comes in here.** Phase 0 has nothing worth driving in a
  browser. From now on the suite should guard the slice every module copies.
  It runs Chromium only against a real backend on a temp data dir, with 5–6
  tests: quick-add with parsing → shows in Today; complete + undo; drag
  reorder survives reload; edit in the detail panel; theme switch; 375 px
  viewport smoke. It runs via `py scripts\test.py --e2e` and is part of
  `check.py --full`. It stays out of the default fast loop.
- A "module recipe" section in ARCHITECTURE: the checklist for adding a
  module, derived from what todos actually needed.

**Done when:** all of the above is usable daily via `serve.py`, every
mutation is optimistic with a tested rollback, and `check.py --full` is
green.

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
| Python | **3.14.8** | You have 3.13.3. I recommend 3.14 because `uuid.uuid7()` is in the stdlib (one less dependency), annotations are evaluated lazily, and it is supported until 2030. It has been stable for a year. |
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
| httpx | 0.28.1 | dev. FastAPI's `TestClient` requires it. Maintained by Encode. The last release is old but it is stable and still the standard. |
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
| @dnd-kit/react (+ @dnd-kit/helpers) | 0.5.0 | Accessible drag and drop with pointer, touch and **keyboard** sensors and sortable lists. Accessible cross-container DnD is a serious amount of work. **Caveat:** it is the new 0.x API, actively released (Sept 2026), while the stable `@dnd-kit/core` 6.3.1 has had no release since Dec 2024. I wrap it in `ui/Sortable` so a swap stays local. See question 9. |
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

## Assumptions

1. The UI language is English. Dates display as `Wed 8 Oct`, `8 Oct 2026`
   and 24-hour time. Quick-add keywords are English.
2. Todos belong to **flat lists** plus an implicit **Inbox**
   (`list_id NULL`). There are no areas, sections, headings or subtasks in
   phase 1.
3. Due dates are date-only in phase 1. Times of day arrive with the calendar.
4. Priorities are none/low/medium/high.
5. Manual ordering exists inside the Inbox and lists. Today and Upcoming sort
   automatically (overdue first, then priority, then list position).
6. Completed todos stay visible, struck through, for the rest of the day,
   then move to a paginated Logbook.
7. Notes on a todo are plain text in phase 1. Markdown rendering is deferred.
8. Deleting is soft and undoable. There is no trash view in phase 1 (undo
   covers it). Purging waits until sync is designed.
9. Real data lives in `%LOCALAPPDATA%\PlanBox`. Dev data lives in `var\dev`.
10. The daily-use server runs on port 8765, separate from dev (8000/5173),
    so both can run at the same time without sharing a database. Autostart at
    login is not in scope yet.
11. Fonts are the system stack (Segoe UI Variable on Windows), so there is no
    font dependency.
12. The accent colour is an indigo-blue (`oklch(0.55 0.19 264)`).
13. The `master` branch is used as is. I commit only when you ask.
