# PlanBox

A personal, local-first planner for one person on one Windows 11 desktop. It
combines todos, knowledge collections (notes, links and snippets grouped into
collections), a calendar and habit tracking. The app grows one module at a
time. The desktop is the hub. Mobile access as a PWA over a private network
will come later.

> **Status:** phase 1 (todos) is done. That covers areas, lists, sections,
> todos and subtasks, plus Today, Upcoming and Logbook, quick-add, keyboard
> control, drag and drop and undo. Knowledge collections come next. See
> [docs/PLAN.md](docs/PLAN.md).

## Using it

- **Ctrl+K** opens the command palette (every action and every list).
  **?** shows all keyboard shortcuts.
- **Q** is quick-add. Type, for example,
  `Pay rent fri !1 @money #Home/Bills`:
  - a date: `today`, `tomorrow`, `fri`, `next week`, `in 3 days`, `24.12`
  - a priority: `!1` high to `!3` low
  - tags: `@tag`
  - a list and optional section: `#List/Section`

  **Shift+Q** adds a subtask to the selected todo.
- In a list: **↑/↓** select, **Space** or **X** completes, **Enter** opens
  details, **Alt+↑/↓** moves, **Alt+→/←** makes a subtask or promotes it,
  **T/M** set the date to today or tomorrow, **D** picks a date, **V** moves
  the todo to another list, **1/2/3/0** set the priority, **Delete** deletes.
- **Ctrl+Z** undoes the last delete, completion or move.
- Drag todos to reorder them, or drop them on a list in the sidebar. Drag
  lists between areas, and drag sections by their grip.

## What it is

- **Backend:** Python 3.12 or newer, FastAPI and SQLite (the stdlib `sqlite3` module,
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

## Two ways to install

| | Developer PC | Runtime-only PC |
|---|---|---|
| For | Working on PlanBox (the home PC) | Just using it (e.g. the work PC) |
| Needs | Windows 11, Python 3.12+ (3.14 at home), Node.js 24 LTS | Windows 11, Python 3.12+, pip. **No Node.js.** |
| Gets the code from | a git clone | a release zip `PlanBox-<version>.zip` |
| Frontend | built from source, rebuilt when it changes | prebuilt `frontend/dist` inside the zip |
| Python packages | runtime + dev tools (pinned by `requirements.lock.txt`) | runtime only, from `requirements.lock.txt` |

Both run the same app, the same API and the same database format. CI tests
the backend on Python 3.12.10 and 3.14 on every push, so the two machines
cannot drift apart unnoticed.

### Runtime-only PC (no Node.js)

1. Download `PlanBox-<version>.zip` from the
   [releases page](https://github.com/gregor2018github/ProjectPlanBox/releases).
2. Extract it. You get a `PlanBox` folder; put it wherever you like.
3. In that folder run `py main.py`.

The first start installs the Python packages into `PlanBox\.venv`, which
takes about a minute. Your data then lives in `PlanBox\private_data\`.

**Updating safely:**

1. Stop PlanBox with the power button.
2. Extract the new zip over the existing `PlanBox` folder and choose
   *Replace the files in the destination*.
3. Run `py main.py`.

The zip never contains `private_data/` or `.venv/`, so your data and
settings stay as they are. `main.py` reinstalls packages only if the new
version pins different ones. New database migrations run on start, after an
automatic backup to `private_data\backups\`.

Do not delete the `PlanBox` folder to "clean up" an update: `private_data`
is inside it. If you want a fully clean copy, extract the new zip somewhere
else and move `private_data` into it.

### Developer PC

```powershell
git clone https://github.com/gregor2018github/ProjectPlanBox.git
cd ProjectPlanBox
py main.py
```

With Node.js on PATH, `main.py` runs the developer setup the first time
(described below) and then starts PlanBox.

## Start PlanBox

```powershell
py main.py
```

This starts PlanBox and opens it at <http://127.0.0.1:8765> in a window of its
own (Chrome or Edge in app mode, with a separate browser profile; without
either, your default browser). On the first run, and whenever
`requirements.lock.txt` changed, it runs the setup by itself. If PlanBox is
already running, it just opens another window.
On a developer PC the frontend is rebuilt automatically when its sources
changed; a runtime-only PC serves the prebuilt one.

To stop PlanBox, click the **power button** at the bottom of the sidebar (or
run "Shut down PlanBox" from the Ctrl+K palette). You can also press Ctrl+C
in the console window. Either way the PlanBox window closes too. Closing the
PlanBox window stops PlanBox as well.

## First-time setup

```powershell
py scripts\setup.py
```

It picks the mode by itself:
- **With Node.js:** creates `.venv\`, installs the runtime packages plus the
  dev group (pinned by `requirements.lock.txt`; it upgrades pip first,
  because `--group` needs pip 25.1+), runs `npm ci` and generates the API
  types.
- **Without Node.js:** installs only the locked runtime packages. This works
  with the pip that ships with Python 3.12. It needs a prebuilt
  `frontend\dist` and stops with an explanation if there is none.

`--runtime` forces the runtime-only install. You can run setup again safely.

## Commands

All commands run from the repository root. The scripts find `.venv` on their
own, so you do not need to activate it first.

| Command | What it does |
|---|---|
| `py scripts\dev.py` | **Start the dev environment.** Runs the backend with reload on `127.0.0.1:8000` and Vite on `127.0.0.1:5173` (which proxies `/api`). Uses the dev database in `private_data\dev\`. Press Ctrl+C to stop both. Open <http://127.0.0.1:5173>. |
| `py scripts\test.py` | **Run all tests:** pytest, then Vitest. Pass `--e2e` to add the Playwright smoke suite (Chromium against a throwaway server). After a fresh setup, run `npx playwright install chromium` in `frontend\` once. |
| `py scripts\check.py` | The full quality gate: Ruff format and lint, pyright, an API types drift check, Prettier, ESLint, `tsc`, then all tests. Run it before every commit. `--full` adds the Playwright smoke suite. |
| `py scripts\gen_api.py` | Regenerates `frontend/src/core/api/schema.d.ts` from the FastAPI OpenAPI schema. `dev.py` does this on start. |
| `py scripts\migrate.py` | Applies pending migrations (with backup) without starting the server. `--dev` targets the dev database. |
| `py scripts\check.py --fix` | Applies Ruff/Prettier formatting and safe lint fixes, then runs the gate. |
| `py scripts\lock.py` | Regenerates `requirements.lock.txt` (every runtime package, exact versions, resolved with Python 3.12) after you change `[project].dependencies`. `check.py` fails while it is out of date. |
| `py scripts\package.py` | Builds `release\PlanBox-<version>.zip` for runtime-only PCs. Pushing a tag such as `v0.2.0` does the same in CI and attaches the zip to a GitHub release (the tag must match the version in `pyproject.toml` and `backend/planbox/__init__.py`). |
| `py scripts\serve.py` | What `main.py` runs, without opening the app window (`--open` adds that). It serves the app and API from one process on <http://127.0.0.1:8765> with your real data. |

## Data

Everything that must not leave this PC lives in **`private_data/`** at the
repo root. Git ignores the folder.

```
private_data/
├── planbox.db          # your real data (serve.py), plus -wal/-shm files
├── settings.toml       # optional user settings (see below)
├── backups/            # automatic pre-migration backups; the newest 10 are kept
├── browser/            # the PlanBox window's own browser profile (theme etc.)
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
