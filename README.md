# Production Recording Screen

Manufacturing-floor application for real-time production tracking with
scheduled data-entry alerts. Implements the PRD as a static web app
(no backend required) — open `index.html` in Chrome or Edge.

## Files
- `index.html`, `styles.css`, `app.js` — main production screen
- `admin.html`, `admin.js` — configuration page (alert times, snooze,
  hourly target, audio settings)

## Features
- Large, real-time production counter (modifiable via +1/+10/-1 buttons,
  spacebar/Enter, or a wired hardware button mapped to those keys).
- 24-hour clock and shift/line identifier.
- Hourly metrics: target, this hour, efficiency.
- Scheduled alert popup that blocks interaction until data is entered
  (or the operator snoozes for the configured duration).
- Synthesized audio cue (WebAudio) — no external asset.
- Required data-entry form: Shift ID, Production Count, Operator ID,
  Equipment Status (Running / Idle / Maintenance / Breakdown), Notes.
- Offline-safe: all state is persisted to `localStorage`; submissions
  queue while offline and flush on `online` event.

## Admin
Open `admin.html` from the link in the top-right of the main screen to
edit alert times (comma-separated `HH:MM`), snooze duration, hourly
target, audio enable/volume, and shift identifiers. Settings persist
across reloads and broadcast to the main screen via the `storage`
event.

## Keyboard shortcuts (main screen)
- `Space` / `Enter` — increment counter by 1
- `-` — decrement counter by 1
