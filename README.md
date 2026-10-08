# PlanBox

A personal, local-first planner for one person on one Windows 11 desktop. It
combines todos, knowledge collections (notes, links and snippets grouped into
collections), a calendar and habit tracking. The app grows one module at a
time. The desktop is the hub. Mobile access as a PWA over a private network
will come later.

> **Status:** planning. Nothing below runs yet. Phase 0 adds the commands
> described here. See [docs/PLAN.md](docs/PLAN.md).

## What it is

- **Backend:** Python 3.14, FastAPI and SQLite (the stdlib `sqlite3` module,
  WAL mode, numbered SQL migrations). It binds to `127.0.0.1` only.
- **Frontend:** React, Vite and TypeScript (strict), styled with Tailwind CSS
  and design tokens, Base UI primitives, Motion and TanStack Query. It
  reaches data only through the HTTP API, and its API types are generated
  from the backend's OpenAPI schema.
- **Data:** a single SQLite file. A backup is taken automatically before any
  schema migration.

Further reading:

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Structure, modules, data model, data flow |
| [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) | Code conventions and the design system |
| [docs/PLAN.md](docs/PLAN.md) | Phased plan, dependencies, assumptions |
| [CLAUDE.md](CLAUDE.md) | Standing instructions for agent sessions |

## Requirements

- Windows 11
- Python 3.14 (`py -3.14` must work)
- Node.js 24 LTS (or newer) and npm

## First-time setup

```powershell
py -3.14 scripts\setup.py
```

This creates the virtual environment in `.venv\`, installs the Python
dependencies (including the dev group), runs `npm ci` in `frontend\` and
installs the git hooks, if any. You can run it again safely.

## Commands

All commands run from the repository root. The scripts find `.venv` on their
own, so you do not need to activate it first.

| Command | What it does |
|---|---|
| `py scripts\dev.py` | **Start the dev environment.** Runs the backend with reload on `127.0.0.1:8000` and Vite on `127.0.0.1:5173` (which proxies `/api`). Uses the dev database in `var\dev\`. Press Ctrl+C to stop both. Open <http://127.0.0.1:5173>. |
| `py scripts\test.py` | **Run all tests:** pytest, then Vitest. Pass `--e2e` to add the Playwright smoke suite (from phase 1). |
| `py scripts\check.py` | The full quality gate: Ruff format and lint, pyright, an API types drift check, Prettier, ESLint, `tsc`, then all tests. Run it before every commit. `--full` adds the Playwright smoke suite. |
| `py scripts\gen_api.py` | Regenerates `frontend/src/core/api/schema.d.ts` from the FastAPI OpenAPI schema. `dev.py` does this on start. |
| `py scripts\serve.py` | **Daily use.** Builds the frontend if needed and serves app and API from one process on <http://127.0.0.1:8765>, using your real data directory. |

## Data

| Mode | Database location |
|---|---|
| `serve.py` (daily use) | `%LOCALAPPDATA%\PlanBox\planbox.db` (override with `PLANBOX_DATA_DIR`) |
| `dev.py` | `var\dev\planbox.db` (gitignored) |
| tests | a temporary directory per test |

Backups are written to `<data dir>\backups\` before migrations run. The last
10 are kept.

## Configuration

Settings come from environment variables. All of them are optional.

| Variable | Default | Meaning |
|---|---|---|
| `PLANBOX_DATA_DIR` | see above | Where the database and backups live |
| `PLANBOX_TIMEZONE` | `Europe/Amsterdam` | The zone used to decide what "today" is |
| `PLANBOX_PORT` | `8765` (serve) / `8000` (dev) | Backend port. The host is always `127.0.0.1`. |
