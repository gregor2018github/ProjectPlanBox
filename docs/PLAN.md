# Plan

Every phase ends with the same steps: `py scripts\check.py` is green, the
docs are updated, and there is a short report (what was built, what was
deferred, what diverged from the plan). Agreed but unscheduled items live in
[TODO.md](TODO.md). How things work is in [ARCHITECTURE.md](ARCHITECTURE.md);
this file records what was planned, decided and pinned.

## Status

| Phase | State |
|---|---|
| 0. Foundation | Done 2026-10-08 |
| 1. Todos | Done 2026-10-08 |
| 2. Knowledge collections and core links | Built 2026-10-10 |
| 3. Search | Built 2026-10-10 |
| 4. Calendar | Built 2026-10-10 (brought forward) |
| 5. Habits | Built 2026-10-10 |
| 6. Recurring todos | Built 2026-10-10 (brought forward) |
| Insights (statistics page) | Built 2026-10-11 (owner request) |
| Area colours | Built 2026-10-11 (owner request) |
| Home overview | Built 2026-10-11 (owner request) |
| Quote footer | Built 2026-10-11 (owner request) |
| Create buttons | Built 2026-10-11 (owner request) |
| Work-day feedback | Built 2026-10-12 (owner request) |
| **7. Mobile PWA** | **Next, not started** |
| **8. Data safety and sync** | **Not started** |

Side task (2026-10-10): Python 3.12 became the minimum, with a runtime-only
install (no Node.js), a lock file, release zips and CI on 3.12 and 3.14.

## Open phases

### Phase 7: Mobile PWA

Manifest and service worker, binding to the private network interface,
authentication, and a touch polish pass. Binding beyond `127.0.0.1` and
relaxing the loopback `Host` check need the owner's explicit go-ahead
(CLAUDE.md). The theme preference moves from `localStorage` to the server so
it follows across devices.

### Phase 8: Data safety and sync

Scheduled and off-machine backups, export/import, and a sync design built on
the existing UUIDv7 IDs, timestamps and tombstones. Purging soft-deleted rows
and a trash view wait for this design. Off-machine backups can be brought
forward, since PlanBox is already in daily use.

## Built phases

Each summary lists what exists and the decisions worth remembering. The
follow-ups each phase cut are in TODO.md.

### Phase 0: Foundation

The backend skeleton (settings from defaults → `settings.toml` → `PLANBOX_*`,
SQLite with WAL and foreign keys, the migration runner with checksums and
pre-migration backups, UUIDv7, clock, problem+json errors, entity registry),
the frontend shell (tokens, themes, `ui/` primitives, sidebar, detail panel,
shortcut registry, command palette), the generated API types, the boundary
tests and the scripts. Added later at the owner's request: the `main.py`
launcher with its own app window, the shutdown button and the loopback `Host`
check.

### Phase 1: Todos

Areas, lists, sections, todos and subtasks; Inbox, Today, Upcoming and
Logbook; quick-add with parsing; full keyboard control (table in the
README); drag and drop; undo; tags; a Playwright smoke suite. As built:
- Drag and drop wraps `@dnd-kit/react` in `ui/dnd.ts`; its Accessibility
  plugin is off and keyboard reordering is Alt+↑/↓ and "Move to…" (V).
- Pickers use our own `ui/PickerList`, not Base UI's Combobox.
- Generated types use `--default-non-nullable false`, so fields with server
  defaults stay optional in request bodies.

### Phase 2: Knowledge collections and core links

Collections of notes, links and snippets, and core links between any two
items. Decisions:
- **One entries table with a `kind`**, not three tables. The kinds differ by
  one column each, and three tables would triple the code and make "all of a
  collection" a union. It is still a specific table, not a generic item
  model. A kind is fixed at creation.
- Links need an `http(s)` URL, so a stored link can never run script.
- Links to deleted items stay and show as deleted, so a restore brings them
  back. The link picker reads a client-side **linkable source registry**, so
  core never imports a module.

### Phase 3: Search

A core FTS5 index over todos, knowledge and habits, shown in the palette.
**Diverged from the first design:** modules do not push to the index in
their write transactions. The index pulls rows changed since its watermark
at the start of every search, which cannot be broken by a forgotten call. It
relies on every write bumping `updated_at` (ARCHITECTURE §6.3).

### Phase 4: Calendar (brought forward)

Events with month, week and day views, recurring events with
this/following/all edits, todo due dates on the calendar, and a right-hand
icon rail with a calendar pane. Decisions:
- Recurrence is expanded on the server in the configured zone, so a weekly
  09:00 stays at 09:00 across DST.
- Todos reach the calendar through a core **calendar feed** registry, not a
  module import.
- A multi-day event is one item everywhere: one bar per week row, one agenda
  row with its whole range.
- Google Calendar sync is not in scope (TODO.md).

### Phase 5: Habits

Habits with schedules, daily check-ins and streaks, a Habits page (`G B`,
because `G H` is Home), a detail panel with a 26-week history, and a rail
pane (`H`). Decisions:
- A streak counts scheduled days, and catching up before the start date
  counts too. "3 times a week, any days" is not expressible yet.
- The history grid is display only; days are ticked in the 7-day strip.

### Phase 6: Recurring todos (brought forward)

Repeat every N days, weeks, months or years, or on chosen weekdays. Rule code
lives in `core/recurrence.py`, shared with the calendar. Decisions:
- Completing one creates the next, which follows the schedule (missed dates
  are skipped) unless the repeat counts from completion (below).
- Each occurrence is its own row, so the Logbook keeps every completion.
- Undo of a completion reopens it and removes the next one.

Follow-ups built 2026-10-10 (rules in ARCHITECTURE §7, Recurrence):
- Repeat after completion: `repeat_from` (migration `todos/0004`), plain
  intervals only, since chosen weekdays or month days are a schedule.
- Several days of the month ("On days…" grid, 1–31 and last day) in the
  shared editor, so events and habits get it too.
- Quick-add repeats, always introduced by "every" (so "weekly report" stays
  a title): `every 3 days`, `every mon, thu`, `every 1st and 15th`,
  `… after done`.
- Later dates on the calendar (`GET /api/todos/forecast` for the ranges the
  calendar shows), read-only.
- Skip one date (`…/skip`; detail panel, row menu, **S**; Ctrl+Z).
- A repeat set without a due date now starts on the rule's first date from
  today, not on today.

### Insights (owner request, 2026-10-11)

A statistics page (`/insights`, sidebar, `G S`) with numbers, charts and
tables across every module. Decisions:
- **Each module owns its numbers.** The page renders the core overview,
  then each manifest's `InsightsSection`. Todos need a server endpoint
  (`GET /api/todos/stats`), since the client only holds open and today's
  todos; knowledge and habits compute from the caches they already load.
- **Cross-module activity through the registry**, like search: an
  `EntityType` may offer `activity(conn, since)` (created, completed and
  deleted instants), and `GET /api/insights/activity` buckets them by local
  day. History is therefore retroactive from the existing timestamps.
- **"Logins" are app opens.** PlanBox has no accounts, so each page load
  records one row in `core_app_opens` (core migration `0004`). There is no
  history before this feature, which the page says.
- **No chart library.** Columns, bars and heat grids are small token-styled
  components in `ui/`; a dependency would bring its own colours, motion and
  bundle weight for four simple forms.
- "Added" leaves out the next occurrence a repeating todo creates itself,
  and lead times leave repeating todos out (their wait is the schedule).

### Area colours (owner request, 2026-10-11)

Each area has a colour, picked by default for new areas and changed in
**Area settings** (⋯ menu or right-click on the area) with a hue wheel and
eight suggested colours. Decisions (ARCHITECTURE §7, STYLE_GUIDE B1, Tints):
- **Only a hue is stored** (migration `todos/0005`). The themes fix
  lightness and chroma, so every colour stays quiet, works in light and dark
  and passes the contrast test at every hue.
- **A tint, not a second accent.** Inside an area's pages and sidebar
  group the accent family takes the area's hue. Elsewhere the area shows
  only as a small dot. The one-accent rule now holds per view.
- **No colour-picker dependency.** The wheel is a small `ui/HueWheel`
  (pointer, keyboard and touch).
- Fixed on the way: `tokens.test.ts` matched the header comment instead of
  the `[data-theme="dark"]` rule, so the dark contrast checks had been
  re-testing the light values. They now test the dark theme, and it passes.

### Create buttons (owner request, 2026-10-11)

Creating lists, areas and todos was hard to find (one combined "+" menu by
"Lists", context menus, Q). Now every sidebar heading has its own **+**
(Todos → quick add, Lists → list, Knowledge → entry), a folder **+** makes
the container (area, collection), and each area row has a **+** for a list
in it. Area pages get **New list** and an **Add todo** row per list; list
pages a **New section** button. Decisions:
- The todos create dialogs live only in the Host and open through
  `todos/createStore.ts` (like `newEntryStore`), so the sidebar and the area
  page no longer keep their own copies. A new area now opens its page, as a
  new list already did.
- The area row's **+** shows on hover and focus and always on touch (the
  hover rule); it is also in the area's context menu.

### Home overview (owner request, 2026-10-11)

Home (`/`, `G H`) was a date on an empty page and "/" redirected to Today.
It is now an overview with one card per module plus the last 7 days
(ARCHITECTURE §6.4, after Insights). Decisions:
- **Each module owns its card**, like Insights: a `HomeSection` in the
  manifest, ordered by `homeOrder` (todos, calendar, habits, knowledge).
  The manifest's `homePath` redirect is gone.
- **Actionable, not a report.** Cards reuse the module's own rows, so todos
  can be completed, habits ticked, and events and entries opened in place.
  Numbers and charts stay on Insights; Home shows only what matters now.
- **No new endpoints.** Every card reads caches its module already loads;
  the week card shares the Insights activity query.

### Work-day feedback (owner request, 2026-10-12)

Small iterations after a first day of use at work, one commit each:
- **Subtask due dates in the checklist.** Subtasks always had their own due
  date, but only from their own detail panel or a list row. The parent's
  checklist now shows each subtask's date and offers a compact date picker
  (the icon appears on hover and focus, always on touch).
- **Search in the shortcut overview** (`?`): a field on top, focused on
  open, keeps the shortcuts whose description, group or keys contain every
  typed word. Plain substring words rather than the palette's fuzzy scorer,
  so a reference list does not fill with loose matches.
- **L for tags.** On a selected todo, `L` opens its detail panel with the
  tag picker open (like `D` and `V`; also "Tags…" in the row menu). With a
  knowledge entry open, `L` opens that entry's tag picker. `L` as in label,
  since `T` is "due today" and `#` names a list in quick-add.

## Dependencies

Versions were checked against PyPI and npm on **2026-10-08** (later additions
on their own dates) and are pinned exactly. A new package needs a row here
first (CLAUDE.md rule 9).

### Runtimes

| Runtime | Pick | Note |
|---|---|---|
| Python | **3.12 minimum**; 3.14.8 on the home PC, 3.12.10 on the work PC | 3.12.10 is the last 3.12 with a python.org Windows installer and bundles SQLite 3.49.1 (STRICT and FTS5 work). |
| Node.js | **24 LTS** | Vite 8 needs ≥ 20.19. Node 26 becomes LTS on 2026-10-28; we can move later. Not needed on runtime-only PCs. |
| SQLite | bundled with CPython | FTS5 confirmed available |

### Python

| Package | Version | Why |
|---|---|---|
| fastapi | 0.143.0 | Web framework. |
| pydantic | 2.14.0 | Comes with FastAPI; pinned because we import it directly. |
| uvicorn | 0.54.0 | ASGI server. Plain install: uvloop does not exist on Windows. |
| python-dateutil | 2.9.0.post0 | Evaluates RFC 5545 RRULEs (phase 4). Correct expansion (BYSETPOS, DST) is a deep rabbit hole. Mature, updated rarely. Pulls in `six` 1.17.0. |
| tzdata | 2026.5 | Windows has no zone database, so `zoneinfo` needs it for `Europe/Amsterdam`. The IANA data packaged by CPython core developers (PEP 615). |
| ruff | 0.16.10 | dev. Lint and format. |
| pyright | 1.1.414 | dev. Same engine as Pylance, so the editor and the gate agree. |
| pytest | 9.1.1 | dev |
| httpx | 0.28.1 | dev. FastAPI's `TestClient` needs it. Starlette 1.7 prefers `httpx2` and warns; we filter that warning and relax pyright for `backend/tests`. Switching needs approval (TODO.md). |

Not used: SQLAlchemy/SQLModel (ARCHITECTURE §3), pydantic-settings (a small
dataclass does it), uuid6 (our own UUIDv7 in `core/ids.py`), pytest-cov.

### Frontend

| Package | Version | Why |
|---|---|---|
| react, react-dom | 19.3.0 | Fallback if needed: 19.2.8. |
| vite, @vitejs/plugin-react | 8.3.4 / 6.1.2 | Build and dev server. |
| typescript | **5.9.3** (not 7.x) | `typescript-eslint` and `openapi-typescript` do not support TS 7 yet. Move up when they do. |
| tailwindcss, @tailwindcss/vite | 4.3.3 | Styling over our tokens. |
| @base-ui/react | 1.8.0 | Headless primitives. Chosen over Radix for Combobox, Toast, Context Menu and the `render` prop. Confined to `src/ui/`. |
| motion | 14.0.0 | Animation, from `motion/react`. |
| @tanstack/react-query | 5.104.1 | Server cache and optimistic mutations. |
| @tanstack/react-router | 1.170.41 | Routing with typed search params (`?item=`). Code-based routes. |
| openapi-fetch | 0.17.0 | A small typed `fetch` over the generated `paths`. Still 0.x. |
| @dnd-kit/react, @dnd-kit/dom | 0.5.0 | Drag and drop with touch and cross-container moves. The new 0.x API; the stable `@dnd-kit/core` has had no release since Dec 2024. Confined to `src/ui/`. |
| date-fns, @date-fns/tz | 4.4.0 / 1.5.0 | Date maths, Monday weeks, formatting in a named zone. `Temporal` is not on every target browser yet. |
| lucide-react | 1.53.0 | Icons. |
| openapi-typescript | 7.13.0 | dev. Generates `schema.d.ts`. |
| vitest, jsdom | 5.0.3 / 30.1.2 | dev |
| @testing-library/react / dom / user-event / jest-dom | 16.3.3 / 10.4.2 / 14.6.7 / 7.0.1 | dev |
| @playwright/test | 1.64.0 | dev. Smoke suite (`check.py --full`). |
| eslint, @eslint/js, typescript-eslint | 10.12.0 / 10.0.1 / 8.71.1 | dev |
| eslint-plugin-react-hooks, eslint-plugin-react-refresh | 7.1.1 / 0.5.7 | dev |
| eslint-plugin-jsdoc | 65.2.0 | dev. Enforces JSDoc on exports. |
| prettier | 3.9.9 | dev. Formats TS/CSS/JSON. |
| @types/react, @types/react-dom | 19.3.0 | dev |

Not used: `cmdk` (the palette is Base UI plus a small scorer),
`clsx`/`cva`/`tailwind-merge` (a 5-line `cx()`), a hotkeys library (our
registry needs scope + not-in-input semantics), MSW (we inject `fetch`),
`fractional-indexing` (we need a Python twin; shared test vectors keep
parity), `concurrently` (`dev.py` does it), React Compiler.

## Decisions and assumptions

1. Areas, sections and subtasks exist. Todos live in a list or the Inbox,
   never directly in an area. Subtasks are one level deep. Sections exist
   only in lists.
2. Upcoming is auto-sorted (overdue first, then priority, then list
   position). Today is sortable by hand within its Overdue and Due today
   groups (`todos.today_position`, cleared when the due date changes).
3. Todo due dates are date-only. Times exist on calendar events.
4. Deleting any container soft-deletes everything below it with one shared
   `deleted_at`, and one undo restores it all. No confirmation dialogs for
   undoable actions.
5. Completed todos stay struck through for the rest of the day, then move to
   the Logbook.
6. English UI and quick-add keywords. Dates display as `Wed 8 Oct` and
   `8 Oct 2026`, with 24-hour time.
7. System font stack and a single indigo-blue accent
   (`oklch(0.55 0.19 264)`), contrast-tested in both themes. Areas re-tint
   it with their own hue inside their pages (Area colours above).
8. `private_data/` holds everything that must not leave the PC: the real DB,
   `settings.toml`, backups and the dev DB (`private_data/dev/`).
9. The daily server runs on port 8765, separate from dev (8000/5173).
   Autostart at login is not in scope.
10. The theme preference lives in `localStorage` so it applies before first
    paint (until phase 7).
