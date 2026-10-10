# Later

Agreed items that are not scheduled into a phase yet. Done items are removed,
not ticked; git history keeps them.

## Data safety

- [ ] Off-machine backups. Backups live inside `private_data/`, so they do
      not survive losing that folder or the disk. Planned for phase 8; bring
      it forward, since PlanBox is in daily use.
- [ ] A trash view (undo covers deletes for now). Purging waits for sync.

## Claude connectors (claude.ai)

Configured on the owner's claude.ai account but not authorized for Claude
Code sessions; authorize each in the claude.ai connector settings (a
non-interactive session cannot run OAuth). Decide the use case first. Any
integration needs its own plan and must respect the "data stays on this PC"
rule.

- [ ] **Google Calendar:** import or mirror events.
- [ ] **Gmail:** turn emails into todos or knowledge entries.
- [ ] **Google Drive:** link Drive files from knowledge, or use Drive as the
      off-machine backup target.

## Dependencies

- [ ] **httpx → httpx2 (dev only).** Starlette 1.7's `TestClient` prefers
      `httpx2` and warns about `httpx`. Swap the pin, then drop the pytest
      warning filter and the pyright relaxation for `backend/tests`. Needs
      owner approval.

## Cross-module

- [ ] Markdown rendering for todo and knowledge notes (plain text now).
- [ ] Reminders and notifications (calendar events and habits).
- [ ] Split the frontend bundle per module.

## Todos

- [ ] Open Logbook rows in the detail panel. The single-todo GET and the
      read-only panel exist (search uses them); the Logbook rows only need
      to open it.
- [ ] "Repeat after completion" (every 3 days counted from when it was done).
- [ ] Several days of the month in the repeat editor (the engine accepts
      them).
- [ ] Quick-add syntax for repeats ("every monday", "every 2 weeks").
- [ ] Future occurrences of repeating todos on the calendar (only the next
      one shows).
- [ ] Skip one occurrence without completing it.

## Calendar

- [ ] Our own date/time fields in the event dialog: Chrome shows the native
      inputs in the browser locale (`10/07/2026`, `02:00 PM`).
- [ ] Touch: moving timed events by dragging (touch uses the dialog now).
- [ ] Undoing a "this and following" change does not re-attach exceptions
      moved to the new series.
- [ ] Links on calendar events (the event dialog has no Links block).

## Knowledge

- [ ] Link titles and previews fetched from the web. It would be the first
      outbound request, so decide that first.
- [ ] Changing an entry's kind (note ↔ link ↔ snippet).
- [ ] Manual order inside a collection (newest change first now), and nested
      collections.
- [ ] Syntax highlighting for snippets (needs a dependency).

## Search

- [ ] Index tag names (a rename does not bump tagged rows' `updated_at`, so
      it needs its own sync rule).
- [ ] Index calendar events (needs a per-type "open" hook, since events open
      in a dialog, not the `?item=` panel).
- [ ] A search page with filters and more than 20 results.
- [ ] Highlight matched words inside the opened item.

## Habits

- [ ] Weekly targets ("3 times a week, any days"), with their own streak
      rule.
- [ ] Counts per day ("8 glasses of water").
- [ ] Reordering habits and archiving (pausing) one.
- [ ] Editing the start date in the detail panel (the API accepts it).
- [ ] Ticking days in the history grid on desktop.
