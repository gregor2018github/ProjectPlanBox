# Later

Agreed items that are not scheduled into a phase yet. Done items are removed,
not ticked; git history keeps them.

## Data safety

- [ ] A trash view and purging tombstones older than 90 days, with a
      purge horizon that imports respect (designed in ARCHITECTURE §13).
- [ ] Restore a backup from the Data page (now a manual file swap with
      the app stopped; see README).
- [ ] When an import keeps one of two duplicate tags, move the losing
      tag's taggings to the survivor (they are hidden with it now).
- [ ] Sync by itself: on opening the phone app and on closing PlanBox on
      a PC (Drive sync is manual now, with **Sync now**).
- [ ] Encrypt the Drive files with a passphrase only the owner's devices
      know (Google now holds the exports in plain JSON, in the owner's own
      Drive).

## Phone app

- [ ] A release-signed APK (and its SHA-1 as a second Android OAuth
      client), so the app can be built on any PC and installed without USB
      debugging.
- [ ] Name the phone in sync (now "Android phone").
- [ ] Save an export file from the phone (a WebView cannot download a blob;
      needs a share or file plugin). Import works.
- [ ] Reminders and notifications on the phone.
- [ ] Keyboard hints like "Press Q" make no sense on a phone without a
      keyboard; show a tap hint there.
- [ ] Import exports from an older schema version (now refused; both PCs
      must run the same version).

## Phone access

- [ ] A list of paired devices with per-device sign-out (now only "Sign
      out all phones").
- [ ] Read cached data offline on the phone (the shell opens offline, the
      data does not).
- [ ] A QR code for the phone address and pairing code (needs a
      dependency or a small encoder).

## Claude connectors (claude.ai)

Configured on the owner's claude.ai account but not authorized for Claude
Code sessions; authorize each in the claude.ai connector settings (a
non-interactive session cannot run OAuth). Decide the use case first. Any
integration needs its own plan and must respect the "data stays on this PC"
rule.

- [ ] **Google Calendar:** import or mirror events.
- [ ] **Gmail:** turn emails into todos or knowledge entries.
- [ ] **Google Drive:** link Drive files from knowledge. (Off-site backups
      already work with any synced folder, including Drive for desktop.)

## Dependencies

- [ ] **httpx → httpx2 (dev only).** Starlette 1.7's `TestClient` prefers
      `httpx2` and warns about `httpx`. Swap the pin, then drop the pytest
      warning filter and the pyright relaxation for `backend/tests`. Needs
      owner approval.

## Cross-module

- [ ] Markdown rendering for todo and knowledge notes (plain text now).
- [ ] Reminders and notifications (calendar events and habits).
- [ ] Split the frontend bundle per module.

## Insights

- [ ] A calendar section (hours booked per week, busiest days). The
      calendar caches per month and expands repeats on the server, so it
      needs its own stats endpoint.
- [ ] A date-range filter (the overview is fixed to 12 months, todo flows
      to 26 weeks, habits to the cached 26 weeks).
- [ ] Due-date changes are not recorded, so "postponed how often" cannot be
      shown yet; it would need a change log.

## Todos

- [ ] Open Logbook rows in the detail panel. The single-todo GET and the
      read-only panel exist (search uses them); the Logbook rows only need
      to open it.
- [ ] The Logbook's Activity view shows each todo once, at its latest
      change. A full history (added Monday, edited Wednesday, what changed)
      needs a todo event table; the same log would answer "postponed how
      often" above.
- [ ] Quick-add for nth weekdays ("every 2nd tue"); the editor has them.
- [ ] Skip changes the date only when the server answers (only the server
      expands rules). Fine on localhost; make it optimistic if it lags.

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
- [ ] Manual order inside a collection (newest change first now), and nested
      collections.
- [ ] Syntax highlighting in code blocks (needs a dependency, e.g. lowlight).
- [ ] Pages on the phone: touch-friendly moving and resizing of boxes, a
      compact toolbar, and adding images (the device backend answers image
      uploads with 409 now).
- [ ] Images in backups and off-site copies (they live in `<data>/images`,
      outside the database, so a backup restore loses no page but the images
      are only as safe as that folder).
- [ ] Remove image files no page (live or deleted) refers to any more.
- [ ] A page that is open does not take in a change synced or imported
      meanwhile; it shows when the page is opened again.
- [ ] Bring a box to the front / send it back (boxes stack in creation order).
- [ ] Text colour and font size, page templates, drawing (ink).

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
