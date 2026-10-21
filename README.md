# PlanBox

A personal, local-first planner for one person. It combines todos,
knowledge collections (notes, links and snippets grouped into collections),
a calendar and habit tracking. The app grows one module at a time. It runs
on Windows PCs (from Python or as `PlanBox.exe`) and as an Android app,
each with its own database; your own Google Drive keeps them in step. A
phone can also use a running PC over the home network or Tailscale.

> **Status:** every planned phase is built: todos (with repeats and a
> hand-sorted "My order"), knowledge collections and links between items,
> search (Ctrl+K), calendar (`C` or the right-edge icon; `G C` for the full
> page) and habits (`H`; `G B` for the page), a Home overview (`G H`), an
> Insights page with statistics across all of them (`G S`), backups and
> export/import (`G D`), phone access, the Android app and Google Drive
> sync. See [docs/PLAN.md](docs/PLAN.md).

## Using it

- **Ctrl+K** opens the command palette: every action and every list, and
  a search over all todos (completed ones too), knowledge entries and
  habits. Words match as prefixes, so `rep out` finds "Report outline".
  **?** shows all keyboard shortcuts.
- The **+** buttons create things: by the sidebar's **Todos** heading (a
  todo, same as **Q**), **Lists** (a list; the folder button makes an area),
  next to each area (a list in that area), **Knowledge** (an entry; the
  folder button makes a collection) and **Habits**. An area's page has
  **New list** and an **Add todo** row under each list; a list's page has a
  **New section** button.
- **Q** is quick-add. Type, for example,
  `Pay rent fri !1 @money #Home/Bills`:
  - a date: `today`, `tomorrow`, `fri`, `next week`, `in 3 days`, `24.12`
  - a priority: `!1` high to `!3` low
  - tags: `@tag`
  - a list and optional section: `#List/Section`
  - a repeat, always after `every`: `every day`, `every 3 days`,
    `every other week`, `every weekday`, `every mon, thu`,
    `every 1st and 15th`, `every last day`. Add `after done` to a plain
    interval (`every 4 weeks after done`) to count the next date from when
    you finish it.

  **Shift+Q** (or "Create subtask" in a todo's menu) adds a subtask to the selected todo.
- **Data** (bottom of the sidebar, **G D**): the backups, the off-site
  copy's state, **Back up now**, and export/import to move data between
  PCs (see [Data](#data)).
- In a list: **↑/↓** select, **Space** or **X** completes, **Enter** opens
  details, **Alt+↑/↓** moves, **Alt+→/←** makes a subtask or promotes it,
  **T/M** set the date to today or tomorrow, **D** picks a date, **S** skips
  one date of a repeating todo, **V** moves the todo to another list,
  **1/2/3/0** set the priority, **Delete** deletes.
- **Ctrl+Z** undoes the last delete, completion or move.
- The pane above every view filters by tag: click it or press **F**, type
  a tag and press Enter. Only todos and knowledge entries with every chosen
  tag stay visible (a matching subtask keeps its parent, and a matching
  todo keeps its subtasks). The pane glows while a filter is on, the filter
  follows you from view to view, and **Clear filters** (or **Shift+F**)
  shows everything again. Items you add while filtering get the filter's
  tags.
- Drag todos to reorder them, or drop them on a list in the sidebar. Drag
  lists between areas, and drag sections by their grip. In a todo's
  details, drag subtasks by their grip (or press **Alt+↑/↓** in one) to
  reorder its checklist.
- Each area has a colour that quietly tints its pages and marks its todos
  elsewhere with a dot. Change it in **Area settings** (the area's ⋯ menu,
  or right-click it in the sidebar) with the colour wheel or a suggestion.
- **E** adds a note, link or snippet (to the collection on screen, else to
  Unsorted); **G K** opens Knowledge. Filter a view by kind or by words and
  tags. Drag entries onto a collection in the sidebar, and drag collections
  to reorder them. In a list of entries, **↑/↓** move and **Delete** deletes.
- **Home** (sidebar, or **G H**) is the overview: overdue and due-today
  todos to tick off, with counts for the next 7 days and the Inbox; the
  week's events; today's habits; recently changed knowledge entries; and
  the last 7 days across everything. Each card's title opens the full view.
- **Insights** (sidebar, or **G S**) shows statistics: a year of activity
  across every module as a heat map, active-day streaks and when you open
  the app; for todos the weekly flow of added and completed, lead times
  (overall and per priority), the biggest lists, areas and tags, how long
  open todos have waited (the oldest ones open in the detail panel),
  priorities, a weekday × hour punch card of completions, how often due
  dates are met, streaks and records; for knowledge growth per month,
  collections, tags, saved sites and snippet languages; for habits
  consistency per habit and weekday and check-ins per week. Every chart
  has a readout line: point at, tap or arrow-key through it.
- Every todo and entry has a **Links** block in its detail panel: "Link…"
  connects it to any other todo or entry, and the link shows on both sides.

## What it is

- **Backend:** Python 3.12 or newer, FastAPI and SQLite (the stdlib `sqlite3` module,
  WAL mode, numbered SQL migrations). It binds to `127.0.0.1` only.
- **Frontend:** React, Vite and TypeScript (strict), styled with Tailwind CSS
  and design tokens, Base UI primitives, Motion and TanStack Query. It
  reaches data only through the HTTP API, and its API types are generated
  from the backend's OpenAPI schema.
- **Data:** a single SQLite file, backed up daily, weekly and before every
  schema migration, optionally to a second disk as well.
- **Phone app:** the same React app in a Capacitor Android shell, with a
  TypeScript twin of the backend on SQLite (WebAssembly) in place of the
  server, so it works without a PC.
- **Sync:** each device keeps one export file in your Google Drive's hidden
  app data folder and merges the others' on **Sync**. Nothing else leaves
  your devices ([privacy policy](PRIVACY.md)).

Further reading:

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Structure, modules, data model, data flow |
| [docs/STYLE_GUIDE.md](docs/STYLE_GUIDE.md) | Code conventions and the design system |
| [docs/PLAN.md](docs/PLAN.md) | Phased plan, dependencies, assumptions |
| [docs/TODO.md](docs/TODO.md) | Agreed but unscheduled items |
| [CLAUDE.md](CLAUDE.md) | Standing instructions for agent sessions |
| [PRIVACY.md](PRIVACY.md) | Privacy policy (linked from Google's OAuth consent screen) |

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

A third way needs nothing installed at all: the **Windows exe** below.

### Windows exe (no Python, no Node.js)

1. Get `PlanBox-<version>-windows.zip` (from the releases page, or build it
   with `py scripts\package.py --exe`). Send it zipped; virus scanners
   distrust a bare exe that arrives through chat.
2. Extract it somewhere local and writable, e.g. `C:\PlanBox` (not
   Program Files, and not a OneDrive folder: syncing a live database can
   corrupt it). You get a `PlanBox` folder with `PlanBox.exe` and
   `_internal\`.
3. Double-click `PlanBox.exe`. For a shortcut, right-click it and choose
   *Pin to Start* or *Send to > Desktop*.

There is no console window. PlanBox opens in its app window; stop it with
the power button or by closing the window. Your data lives in
`private_data\` next to `PlanBox.exe`. It is created on the first start;
if a `private_data` folder is already there (copied from another install,
say), PlanBox uses it. What PlanBox prints goes to
`private_data\planbox.log`. If it cannot start, a message box shows why.

**Updating:** stop PlanBox, extract the new zip over the `PlanBox` folder
(*Replace the files in the destination*), start it again. The zip never
contains `private_data`, so your data stays. New migrations run after an
automatic backup, as with the other installs.

**Moving from the Python install:** extract the exe zip into your existing
`PlanBox` folder. `PlanBox.exe` then sits next to your `private_data` and
uses it. You can delete `main.py`, `scripts\`, `backend\`, `frontend\` and
`.venv\` afterwards, but never `private_data\`.

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
| `py scripts\test.py` | **Run all tests:** pytest, then Vitest. Pass `--e2e` to add the Playwright smoke suites (Chromium against a throwaway server, and the phone app's build in a phone-sized Chromium). After a fresh setup, run `npx playwright install chromium` in `frontend\` once. |
| `py scripts\check.py` | The full quality gate: Ruff format and lint, pyright, an API types drift check, Prettier, ESLint, `tsc`, then all tests. Run it before every commit. `--full` adds the Playwright smoke suite. |
| `py scripts\gen_api.py` | Regenerates `frontend/src/core/api/schema.d.ts` from the FastAPI OpenAPI schema. `dev.py` does this on start. |
| `py scripts\reindex.py` | Empties the search index so the next search rebuilds it (only needed if search ever looks wrong). `--dev` targets the dev database. |
| `py scripts\migrate.py` | Applies pending migrations (with backup) without starting the server. `--dev` targets the dev database. |
| `py scripts\check.py --fix` | Applies Ruff/Prettier formatting and safe lint fixes, then runs the gate. |
| `py scripts\lock.py` | Regenerates `requirements.lock.txt` (every runtime package, exact versions, resolved with Python 3.12) after you change `[project].dependencies`. `check.py` fails while it is out of date. |
| `py scripts\package.py` | Builds `release\PlanBox-<version>.zip` for runtime-only PCs. `--exe` also builds `release\PlanBox-<version>-windows.zip` (PlanBox.exe with its own Python, smoke-tested before it is zipped). Pushing a tag such as `v0.2.0` builds both in CI and attaches them to a GitHub release (the tag must match the version in `pyproject.toml` and `backend/planbox/__init__.py`). |
| `py scripts\android.py` | Builds the Android app (`frontend\android\app\build\outputs\apk\debug\app-debug.apk`); `--install` puts it on the connected phone or emulator, `--open` opens the project in Android Studio. Needs Node.js and Android Studio. See "Phone app (Android)". |
| `py scripts\serve.py` | What `main.py` runs, without opening the app window (`--open` adds that). It serves the app and API from one process on <http://127.0.0.1:8765> with your real data. |

## Data

Everything that must not leave this PC lives in **`private_data/`** at the
repo root. Git ignores the folder.

```
private_data/
├── planbox.db          # your real data (serve.py), plus -wal/-shm files
├── settings.toml       # optional user settings (see below)
├── backups/            # daily (14 kept), weekly (8), manual, pre-import and pre-migration (10 each)
├── cloud.json          # Google Drive sync: this PC's sync id and sign-in (once connected)
├── browser/            # the PlanBox window's own browser profile (theme etc.)
└── dev/planbox.db      # throwaway dev database (dev.py)
```

Tests never touch `private_data/`. Each test uses a temporary directory.

> **Careful:** `git clean -x` (or `-X`) deletes ignored files, and that
> includes your database. Never run it in this repo. `backups/` lives in
> `private_data/` too, so set `offsite_backup_dir` (below) to keep copies
> that survive losing the folder or the disk.

### Backups

While `py main.py` runs, PlanBox takes a backup when none exists for
today, and one per week (Monday to Sunday); it checks on start and every
hour. The Data page lists them and has **Back up now**. With
`offsite_backup_dir` set, every backup is also copied there (another disk,
a USB stick, or a OneDrive/Dropbox folder). If the folder is unreachable,
the Data page says so and the copies catch up once it is back. Files there
are pruned like the local ones, but never deleted because they are missing
locally.

**Restoring** a backup: stop PlanBox, rename `private_data\planbox.db` (and
delete `planbox.db-wal` and `planbox.db-shm` if present), copy the backup to
`private_data\planbox.db`, then start PlanBox. A backup is a complete,
compacted database file.

### Two PCs: export and import

**Download export** (Data page) saves every row, deleted ones included, as
JSON. **Import an export…** on the other PC merges it in: per item, the
newer version wins, so deletions and edits travel too, and nothing newer is
overwritten. A backup is taken first, and the import applies completely or
not at all. To bring both PCs level, export on A and import on B, then
export on B and import on A. Both need the same PlanBox version (the import
refuses otherwise). If the same thing was created on both (a tag with the
same name, the same habit day), one is kept and the other is stored as
deleted; the import reports how many.

### Phone

Phone access is off until you add `network = true` to
`private_data/settings.toml` and restart PlanBox. Windows then asks once
whether Python may accept connections; allow **private networks** only.

1. The startup output and the Data page (**Phones**) show the address, e.g.
   `http://192.168.2.12:8765`. Open it on the phone (same Wi-Fi, or with
   Tailscale on both devices, from anywhere).
2. On the PC, **Data → Pair a phone** shows a code like `ABCD-EFGH` for ten
   minutes. Type it on the phone. It stays signed in for 400 days.
3. Add PlanBox to the home screen (Chrome: menu → *Add to home screen* or
   *Install app*; Safari: Share → *Add to Home Screen*).

**Sign out all phones** on the Data page undoes every pairing. A phone
cannot pair other devices or shut PlanBox down, and it works only while the
PC runs PlanBox. The theme you pick follows every device.

Over plain http, others on the same Wi-Fi could read the traffic, and the
app cannot open offline. For https, give PlanBox a certificate the phone
trusts: with Tailscale, `tailscale cert <name>.ts.net` and set
`network_hostname` to that name; or use mkcert and install its root
certificate on the phone. Then set `network_tls_cert` and `network_tls_key`.

### Phone app (Android)

Besides phone access (above, which needs the PC running), there is an
Android app with **its own database on the phone**. It does everything the
PC app does (todos, knowledge, calendar, habits, search, insights, backups)
without the PC, and stays in step with your PCs through **Google Drive
sync** (next section). It starts empty; the first sync brings everything
over.

**Build and install** (on the PC with Node.js and Android Studio):

1. On the phone, turn on *Developer options → USB debugging* and connect
   it by USB (or start an emulator in Android Studio).
2. Run `py scripts\android.py --install`. It builds the web app for the
   phone, copies it into the Android project (`frontend\android`), builds
   `app-debug.apk` and installs it. Without `--install` it only builds;
   with `--open` it opens the project in Android Studio, where **Run ▶**
   does the same.

Installing a newer build keeps the phone's data. Uninstalling the app
deletes it, so sync first. The app takes daily and weekly backups on the
phone while it is open (Data page). The phone and every PC must run the
**same PlanBox version** to sync. A sync refuses files from another
version and says so.

### Google Drive sync

Every device (each PC, the phone app) keeps **one file** in a hidden
PlanBox folder in your Google Drive (Drive's *app data* folder, which only
PlanBox can see). On the Data page:

- **Sync now** merges the other devices' files into this one (per item the
  newer version wins, deletions included, as with import), then uploads
  this device's file. Do it on the PC before you leave, and on the phone
  when you open it, and the other way round.
- **Upload only** / **Download only** do just one half.

A backup is taken before every merge. No device ever overwrites another
device's file, so syncing two devices at the same moment is safe.

**One-time setup in Google Cloud** (free; about ten minutes):

1. Open <https://console.cloud.google.com/>, create a project (e.g.
   "PlanBox"), and enable the **Google Drive API** (*APIs & Services →
   Library*).
2. *Google Auth Platform → Branding*: app name "PlanBox", your email, and
   the two URLs Google requires before publishing: homepage
   `https://github.com/gregor2018github/ProjectPlanBox` and privacy policy
   `https://github.com/gregor2018github/ProjectPlanBox/blob/main/PRIVACY.md`.
   *Audience*: **External**. Then press **Publish app** (*In production*).
   Without that, Google signs PlanBox out every 7 days. The only scope
   PlanBox asks for, `drive.appdata`, is non-sensitive, so publishing needs
   no review. The sign-in page may still say Google has not verified the
   app; that is expected for a personal client.
3. *Clients → Create client*, type **Desktop app** (e.g. "PlanBox PC"; one
   client serves every PC). Copy its client ID and secret (also in the JSON
   Google offers to download) into `private_data\settings.toml` on **every
   PC**:
   ```toml
   google_client_id = "1234-abc.apps.googleusercontent.com"
   google_client_secret = "GOCSPX-..."
   device_name = "Home PC"     # optional: how this PC is listed in sync
   ```
   Restart PlanBox, then **Data → Connect Google Drive**. A browser tab
   opens Google's sign-in, and comes back to PlanBox.
4. *Clients → Create client*, type **Android**: package name
   `app.planbox`, and the SHA-1 of the key that signs the app. For the
   builds of `android.py` that is the debug key of the PC that built it:
   ```powershell
   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -list -v -keystore "$env:USERPROFILE\.android\debug.keystore" -alias androiddebugkey -storepass android
   ```
   (the `SHA1:` line). Build the app on that PC (or add a client per
   building PC). Nothing from this client goes into the app or a settings
   file: Google recognises the app by its package name and signature (the
   downloadable JSON has no secret). A new client can take a few minutes
   to work. Then, in the app, **Data → Connect Google Drive**.

The client secret stays in `settings.toml`, and the sign-in token in
`private_data\cloud.json`. Neither ever goes into an export, a backup or
Drive. **Disconnect** signs this device out. To withdraw PlanBox's access
completely, remove it at <https://myaccount.google.com/permissions>.

The dev and scratch databases never sync (they would mix test data into
your real files) unless `PLANBOX_GOOGLE_CLIENT_ID` and
`PLANBOX_GOOGLE_CLIENT_SECRET` are set in the environment.

## Configuration

`private_data/settings.toml`. Every key is optional. Environment variables
(`PLANBOX_<KEY>`) override the file.

```toml
timezone = "Europe/Amsterdam"   # the zone used to decide what "today" is
port = 8765                     # serve.py port (dev uses 8000); the host is always 127.0.0.1
offsite_backup_dir = "D:/PlanBox backups"  # a copy of every backup; another disk or a synced folder
network = true                  # phone access (off by default; see "Phone" above)
network_address = "192.168.2.12"           # optional: the PC's private address (detected otherwise)
network_hostname = "desk.tail1234.ts.net"  # optional: another name the phone may use
network_tls_cert = "D:/certs/desk.crt"     # optional: https for the phone, with the key
network_tls_key = "D:/certs/desk.key"
google_client_id = "1234-abc.apps.googleusercontent.com"  # Google Drive sync (see above)
google_client_secret = "GOCSPX-..."
device_name = "Home PC"         # how this PC is named in Google Drive sync (default: the PC's name)
```

`offsite_backup_dir` applies only to the real database: a dev or
`PLANBOX_DATA_DIR` scratch folder copies off-site only when
`PLANBOX_OFFSITE_BACKUP_DIR` is set.

`PLANBOX_DATA_DIR` moves the whole data folder, for example to an external
drive.
