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

## Data safety

- [ ] Off-machine backups. Backups currently live inside `private_data/`, so
      they do not survive losing that folder or the disk. Planned for phase 8;
      bring it forward if daily use starts before then.
