# Project kickoff: personal planner app (working title: "PlanBox")

## What we are building

A personal planning app that I use daily, combining features I like from
different planning tools. It will grow iteratively over a long time. Planned
feature areas so far: todos, knowledge collections (notes, links, snippets
grouped into collections), a calendar, and habit tracking. More will follow.

Single user, local-first, running on my Windows 11 desktop. The desktop is
the hub. Mobile access comes later and is out of scope now, but must not be
blocked by today's decisions (see "Constraints for later").

## How I want you to work

1. Do not write application code yet. First produce, for my review:
   - README.md (what it is, how to run it)
   - ARCHITECTURE.md (structure, data model, module boundaries, data flow)
   - STYLE_GUIDE.md (code conventions for Python and TypeScript, plus the
     design system: tokens, motion rules, component conventions)
   - CLAUDE.md (standing instructions for future agent sessions)
   - A phased plan, with phase 0 and phase 1 detailed and later phases
     sketched in one line each
2. List open questions and the assumptions you made. Then stop and wait for
   my approval.
3. After approval, build phase by phase. At the end of each phase: tests
   pass, docs are updated, and you give me a short report of what was built,
   what was deferred, and anything that diverged from the plan.

If you think one of my choices below is wrong, say so and argue for the
alternative before building. Do not silently comply or silently deviate.

## Stack

- Backend: Python, FastAPI, SQLite. Use the stdlib `sqlite3` module behind a
  repository layer. No ORM unless you make a convincing case.
- Schema changes go through numbered SQL migration files and a small
  migration runner, from the very first table. Enable WAL mode and foreign
  keys.
- Frontend: React with Vite and TypeScript (strict mode), running in the
  browser.
- Styling: Tailwind CSS with design tokens defined as CSS variables.
- Accessible primitives (dialog, popover, menu, tooltip): a headless library
  such as Radix or Base UI, styled by us. No pre-styled component kit.
- Animation: Motion (the successor of Framer Motion).
- Server state: TanStack Query, with optimistic updates.
- Types: generate the TypeScript API types from FastAPI's OpenAPI schema.
  No hand-written duplicates of backend models.
- Check the current stable version of every dependency before installing,
  and tell me what you picked.

Keep dependencies few. Every package beyond this list needs one line of
justification: what it does, why we should not write it ourselves, and its
maintenance status.

## Architecture rules

- Modular monolith. Each feature area (todos, knowledge, calendar, habits)
  is a module with its own tables, repository, service, API router, and
  frontend folder. Adding a module must not require editing other modules.
- Shared, cross-cutting concepts live in a small core: tags, links between
  entities of different modules (a todo referencing a note), and search.
  Design these in ARCHITECTURE.md now, even if they are built later.
- Do not build a generic "everything is a block/item" data model. Modules
  get honest, specific tables.
- The frontend only reaches data through the HTTP API.
- Layers on the backend: router (HTTP only) -> service (logic) ->
  repository (SQL only). No SQL outside repositories.
- The server binds to 127.0.0.1 only. No auth for now.

## Constraints for later (do not build, do not block)

- Mobile will be a PWA served by the desktop hub and reached over a private
  network. So: layouts must be responsive, nothing may depend on hover
  alone, and touch targets must be reasonably sized.
- Possible sync later. So: primary keys are text UUIDv7 (or ULID), and every
  table has `created_at`, `updated_at`, and `deleted_at` (soft delete).
- Timestamps are stored in UTC as ISO-8601. Display uses the local timezone
  (Europe/Amsterdam). Weeks start on Monday.
- Recurring todos and events will come. Plan to store recurrence as
  iCalendar RRULE strings; reserve room for it in the data model.

## Design direction

The feel matters as much as the features: lean, professional, fluent.

- Clean, modern, rounded. Generous whitespace, one accent colour, restrained
  use of borders and shadows. Light and dark theme from the start, driven by
  tokens.
- A written token set in STYLE_GUIDE.md: colour, spacing scale, radius
  scale, typography scale, elevation, and motion (durations and easings).
- Motion is quick and purposeful: roughly 150 to 250 ms, ease-out for
  entering elements, springs for layout changes such as reordering or
  completing a todo. Nothing decorative that delays an action. Respect
  `prefers-reduced-motion`.
- The app must feel instant. Mutations update the UI optimistically and roll
  back on error. No spinners for local operations.
- Keyboard-first: a command palette (Ctrl+K), a global quick-add, and
  shortcuts for the common actions. Every action is also reachable by mouse.
- App shell: collapsible sidebar with the modules, a main content area, and
  an optional detail panel on the right.

## Code quality

- Python: type hints everywhere, Google-style docstrings, formatted and
  linted with Ruff, type-checked with mypy or pyright.
- TypeScript: strict, no `any`, JSDoc on exported functions and components,
  ESLint clean, one component per file.
- Tests from phase 0: pytest for services and repositories (against a
  temporary SQLite database) and for the API; Vitest with React Testing
  Library for frontend logic and key components. Propose where a small
  Playwright smoke suite should come in.
- One command to start the dev environment on Windows, one to run all tests.
  Document both in the README.
- Python environment via `venv` and `pip`.

## Scope of the first phases

- Phase 0: repository scaffold, tooling, migration runner, app shell with
  sidebar and theme switch, design tokens, a health endpoint, the generated
  API types pipeline, and the test setup. No features.
- Phase 1: todos as a complete vertical slice. Create, edit, complete,
  delete, reorder by drag and drop, due dates, priorities, lists or
  projects, tags, a "today" and an "upcoming" view, quick-add, and
  keyboard shortcuts. This slice sets the pattern every later module copies,
  so it needs to be done properly rather than quickly.
- Later, one module per phase: knowledge collections, calendar, habits.
  Do not start these, and do not add placeholder screens for them.

## What I expect back now

The four documents, the phased plan, your dependency picks with versions,
and your questions. No application code.