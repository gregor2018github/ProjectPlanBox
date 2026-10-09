# CLAUDE.md: standing instructions for agent sessions

PlanBox is a single-user, local-first planner (FastAPI + SQLite backend,
React + TS frontend) built as a modular monolith. The owner uses it daily, so
treat their database as precious.

## Read first
- `docs/PLAN.md`: the current phase, its scope, and the dependency pins.
  Work only within the current phase.
- `docs/ARCHITECTURE.md`: layers, module boundaries, data model, data flow.
- `docs/STYLE_GUIDE.md`: code conventions and the design system (tokens,
  motion, components).
- `docs/BRIEF.md`: the owner's original brief. If a choice conflicts with it,
  raise the conflict. Do not resolve it silently.

## Environment (Windows 11)
- The Python virtual env is **`.venv`** at the repo root. Call
  `.venv\Scripts\python.exe` directly or use the `scripts\*.py` entry points.
  Do not rely on an activated shell.
- **Python 3.12 is the minimum** (the owner's work PC runs 3.12 without
  Node.js; the home PC runs 3.14 with Node 24). Never use 3.13+/3.14-only
  syntax or APIs; Ruff/pyright target 3.12 and CI tests both versions.
- Runtime packages are pinned in `requirements.lock.txt`. After changing
  `[project].dependencies`, run `py scripts\lock.py` and commit the lock.
- Release zips for runtime-only PCs: `py scripts\package.py`, or push a
  `v*` tag (CI publishes it). Only when the owner asks.
- Owner's daily start: `py main.py` (opens the browser; the sidebar's power
  button stops it). Dev: `py scripts\dev.py`. Tests: `py scripts\test.py`.
  Full gate: `py scripts\check.py` (`--full` adds Playwright).
- Never run `main.py`/`serve.py` against the real `private_data/` while
  testing. Use `PLANBOX_DATA_DIR` and `PLANBOX_PORT` pointing at a scratch
  folder and port, and `BROWSER=echo` to avoid opening tabs.
- The server binds to `127.0.0.1` only and accepts only loopback `Host`
  headers. Never change either without an explicit instruction. Mutating
  endpoints take JSON bodies (cross-site protection; see ARCHITECTURE §9, Local-server protections).

## Hard rules
1. **Layers:** router (HTTP only) → service (logic, transactions) →
   repository (SQL only). No SQL outside repositories and the migration
   runner.
2. **Module boundaries:** a module imports only from `core` (and `ui` on the
   frontend), never from another module. `core` never imports modules.
   Registration happens only in `backend/planbox/modules/__init__.py` and
   `frontend/src/modules/index.ts`. `tests/test_boundaries.py` and ESLint
   enforce this. Do not weaken them.
3. **No generic block/item model.** Every module gets specific tables named
   with its prefix.
4. **Migrations:** schema changes only through a new numbered file in the
   owner's `migrations/` folder. **Never edit an applied migration.** It has
   already run against the owner's real database, and the checksum check
   will refuse to start. Every table gets `id` (UUIDv7 text), `created_at`,
   `updated_at` and `deleted_at`. Use `STRICT` and partial unique indexes
   `WHERE deleted_at IS NULL`.
5. **Time:** instants are UTC ISO-8601 with ms and a `Z`, from the injected
   `Clock`. Date-only values are floating `YYYY-MM-DD`. "Today" uses the
   configured zone (Europe/Amsterdam). Weeks start on Monday.
6. **API types are generated.** After any change to schemas or routes, run
   `py scripts\gen_api.py` and commit `schema.d.ts`. Never hand-write
   backend shapes in TS. Alias the generated ones.
7. **The frontend reaches data only through the HTTP API** via
   `core/api/client.ts` and TanStack Query hooks. Mutations are optimistic
   with rollback, following ARCHITECTURE §8.
8. **Design system:** only token-backed utilities. No raw colours or
   arbitrary values outside `tokens.css`. Base UI only through `src/ui/`
   wrappers. Respect the motion rules (150–250 ms, springs for layout,
   reduced motion, never delay an action). Nothing hover-only, and touch
   targets must work.
9. **Dependencies:** no new package without first adding a one-line
   justification (what, why not ours, maintenance status) and an exact pin to
   `docs/PLAN.md`, and telling the owner. Check the current stable version
   before installing.
10. **Do not start future modules,** and do not add placeholder screens,
    routes or tables for them.

## Code quality bar
- Python: type hints everywhere, Google docstrings, Ruff clean, pyright
  strict clean.
- TS: strict, no `any`, JSDoc on exports, one component per file, ESLint and
  Prettier clean.
- Every behaviour change comes with tests: pytest against a temporary SQLite
  DB (never anything in `private_data/`) and Vitest/RTL for frontend logic
  and key components.

## Working style
- At the end of a phase or task: `check.py` is green, the docs (README,
  ARCHITECTURE, STYLE_GUIDE, PLAN) reflect reality, and a short report covers
  **built / deferred / diverged**.
- If you think something in the brief or these docs is wrong, argue for the
  alternative before building. Do not silently comply or silently deviate.
- Commit regularly without being asked: whenever a coherent step is done and
  `check.py` is green. Use imperative, scoped messages (`todos: …`,
  `core: …`). Never push unless asked.
- `private_data/` (gitignored) holds everything that must not leave this
  PC: the real DB, `settings.toml`, backups and the dev DB
  (`private_data/dev/`). Never read its contents into commits, logs or
  external services. Never delete or rewrite anything in it except
  `private_data/dev/`. **Never run `git clean -x`/`-X`**, because it would
  wipe the database.
- Deferred items (e.g. claude.ai connectors) are tracked in `docs/TODO.md`.
