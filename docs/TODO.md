# Later

Items that are agreed but not scheduled into a phase yet.

## Claude connectors (claude.ai)

These connectors are configured on the owner's claude.ai account. They are
not authorized for Claude Code sessions yet, so their tools are unavailable.
To enable them, authorize each one in the claude.ai connector settings. A
non-interactive agent session cannot run the OAuth flow.

- [ ] **Google Calendar.** Possibly import or mirror events once the calendar
      module exists (phase 4).
- [ ] **Gmail.** Possibly turn emails into todos or knowledge items.
- [ ] **Google Drive.** Possibly link Drive files from knowledge collections,
      or use Drive as an off-machine backup target (see below).

Decide the use case first. Any integration is a feature that needs its own
plan and must respect the "data stays on this PC" rule for `private_data/`.

## Dependencies

- [ ] **httpx to httpx2 (dev only).** Starlette 1.7's `TestClient` prefers
      `httpx2` and emits a deprecation warning with `httpx`. Switching means
      swapping the pin in `pyproject.toml`, then removing the pytest warning
      filter and the pyright relaxation for `backend/tests`. It needs owner
      approval because it adds a package that was not on the agreed list.

## Todos follow-ups (deferred from phase 1)

- [ ] Markdown rendering for todo notes (plain text for now).
- [ ] Open Logbook items in the detail panel (needs a single-todo GET).
- [ ] A trash view (undo covers deletes for now).
- [ ] Manual order inside Today, if wanted (it is auto-sorted now).
- [ ] Split the frontend bundle per module once a second module exists.

## Data safety

- [ ] Off-machine backups. Backups currently live inside `private_data/`, so
      they do not survive losing that folder or the disk. Planned for phase 8;
      bring it forward if daily use starts before then.

## Calendar follow-ups (deferred from phase 4)

- [ ] Replace the native date/time inputs in the event dialog with our own
      fields: Chrome shows them in the browser locale (e.g. `10/07/2026`,
      `02:00 PM`) instead of `Wed 7 Oct` and 24-hour time.
- [ ] Multi-day all-day events as bars spanning the month grid (now a chip per day).
- [ ] Touch: moving timed events by dragging (touch uses the dialog; a tap opens/creates).
- [ ] Undoing a "this and following" change does not re-attach exceptions moved to the new series.
- [ ] Reminders/notifications; Google Calendar import (see connectors above).
