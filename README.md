# PlanBox

A personal, local-first planner for one person on one Windows 11 desktop. It
combines todos, knowledge collections (notes, links and snippets grouped into
collections), a calendar and habit tracking. The app grows one module at a
time. The desktop is the hub. Mobile access as a PWA over a private network
will come later.

> **Status:** phase 0 (foundation) is done. The app shell, tooling and
> pipelines run, but there are no features yet. Todos arrive in phase 1. See
> [docs/PLAN.md](docs/PLAN.md).

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
| [docs/TODO.md](docs/TODO.md) | Agreed but unscheduled items |
| [CLAUDE.md](CLAUDE.md) | Standing instructions for agent sessions |

## Requirements

- Windows 11
- Python 3.14.8 (`py -3.14` must work)
- Node.js 24 LTS (or newer) and npm

## First-time setup

```powershell
py -3.14 scripts\setup.py
```

This creates the virtual environment in `.venv\`, installs the Python
dependencies (including the dev group), runs `npm ci` in `frontend\` and
generates the API types. You can run it again safely.

## Commands

All commands run from the repository root. The scripts find `.venv` on their
own, so you do not need to activate it first.

| Command | What it does |
|---|---|
| `py scripts\dev.py` | **Start the dev environment.** Runs the backend with reload on `127.0.0.1:8000` and Vite on `127.0.0.1:5173` (which proxies `/api`). Uses the dev database in `private_data\dev\`. Press Ctrl+C to stop both. Open <http://127.0.0.1:5173>. |
| `py scripts\test.py` | **Run all tests:** pytest, then Vitest. Pass `--e2e` to add the Playwright smoke suite (from phase 1). |
| `py scripts\check.py` | The full quality gate: Ruff format and lint, pyright, an API types drift check, Prettier, ESLint, `tsc`, then all tests. Run it before every commit. `--full` adds the Playwright smoke suite. |
| `py scripts\gen_api.py` | Regenerates `frontend/src/core/api/schema.d.ts` from the FastAPI OpenAPI schema. `dev.py` does this on start. |
| `py scripts\migrate.py` | Applies pending migrations (with backup) without starting the server. `--dev` targets the dev database. |
| `py scripts\check.py --fix` | Applies Ruff/Prettier formatting and safe lint fixes, then runs the gate. |
| `py scripts\serve.py` | **Daily use.** Builds the frontend if needed and serves app and API from one process on <http://127.0.0.1:8765>, using your real data directory. |

## Data

Everything that must not leave this PC lives in **`private_data/`** at the
repo root. Git ignores the folder.

```
private_data/
├── planbox.db          # your real data (serve.py), plus -wal/-shm files
├── settings.toml       # optional user settings (see below)
├── backups/            # automatic pre-migration backups; the newest 10 are kept
└── dev/planbox.db      # throwaway dev database (dev.py)
```

Tests never touch `private_data/`. Each test uses a temporary directory.

> **Careful:** `git clean -x` (or `-X`) deletes ignored files, and that
> includes your database. Never run it in this repo. Backups also live in
> `private_data/` for now, so they do not protect against losing the
> folder. Off-machine backups are planned (see [docs/TODO.md](docs/TODO.md)).

## Configuration

`private_data/settings.toml`. Every key is optional. Environment variables
(`PLANBOX_<KEY>`) override the file.

```toml
timezone = "Europe/Amsterdam"   # the zone used to decide what "today" is
port = 8765                     # serve.py port (dev uses 8000); the host is always 127.0.0.1
```

`PLANBOX_DATA_DIR` moves the whole data folder, for example to an external
drive.
