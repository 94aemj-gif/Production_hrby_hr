# PRD — Production_hrby_hr · Next 2–3 Weeks

**Status:** Draft · **Author:** Eng team · **Audience:** Internal engineering · **Time horizon:** 2–3 weeks

This is a working sprint document. It captures the state of the app, what's
in flight, and the concrete items to ship next. Update it as work lands;
delete sections once an item is in `main`.

---

## 1. Product summary (one paragraph)

A tablet-friendly production-line logging app used on a plant floor. Each
tablet is assigned to one line and one operator; operators log good /
scrap captures throughout their shift. The app is **local-first** —
localStorage is the source of truth, so a tablet keeps working with no
network. A Supabase backend mirrors every write so other tablets, a line
leader's dashboard, and the plant manager's admin view can see live
data. Three personas: **operator** (captures on the floor), **line
leader** (walks between lines, monitors via the Tablero), **plant
manager** (laptop, admin + history + reporting).

## 2. Surfaces shipped today

| Page | URL | Audience | Status |
| --- | --- | --- | --- |
| Capture | `/index.html` | Operator | Stable |
| Charts (live KPIs) | `/index.html#view-charts` | Operator + leader | Stable |
| Dashboard (multi-line) | `/dashboard.html` | Line leader | **PR #13 — pending merge** |
| Admin (4 tabs) | `/admin.html` | Manager | Stable |

## 3. Data architecture (current)

### Local
- `prod.sessions.v1` — array of session objects keyed by
  `(date, lineId, shiftId, operatorId)`. Each session holds captures,
  downtime, currentStatus, etc.
- `prod.log.v1` — bitácora (capped at 500 entries).
- `prod.lines.v1` / `prod.shifts.v1` / `prod.operators.v1` /
  `prod.config.v1` — catalogs + settings.
- `prod.device.v1` — this tablet's line/operator (per-device).
- `prod.sync.*` — sync engine state (queue, watermark, tombstones, dead
  letter, applied-resets, applied-config).

### Supabase
- `devices`, `captures`, `downtime`, `events` — append-only data tables
  with `merge-duplicates` UPSERT on `id`.
- `public.config` — **PR #14 pending** — single key/value/updated_at
  table for shared catalogs/settings.
- RLS:
  - Anon INSERT on all data tables.
  - Anon SELECT on captures/downtime/events.
  - Anon DELETE on captures/downtime/events scoped to "today/recent".
  - Anon SELECT/INSERT/UPDATE on config (no DELETE).

### Sync engine (`sync.js`)
- Push: per-row queue → batched POST → poison-row dead-letter on 400/409/422.
- Pull: paginated GET ≤20k rows/cycle, per-table watermark with 5-min
  overlap, pending-tombstone bridge, day-reset broadcast.
- Cross-tab cooperative lock (`prod.sync.tabLock.v1`, 15s TTL).
- Quota errors surface to the topbar sync chip via `lastError`.

### Known invariants
- Captures are append-only in Supabase; undo / admin-delete are tombstone
  events.
- Local writes are queued before they hit the network.
- Inserts are idempotent: ids are client-generated, server merges
  duplicates.

## 4. Open PRs / in-flight branches

| # | Title | Status | Required action |
| --- | --- | --- | --- |
| #13 | Multi-line dashboard | Green CI, no SQL needed | Merge when ready |
| #14 | Config sync via Supabase | Green CI, **needs SQL migration** | Run SQL, then merge |

SQL needed for #14:

```sql
create table public.config (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
alter table public.config enable row level security;
create policy "anon select config" on public.config for select to anon using (true);
create policy "anon insert config" on public.config for insert to anon with check (true);
create policy "anon update config" on public.config for update to anon using (true) with check (true);
```

## 5. Known issues / debt (must-fix priority)

### Critical (track for the sprint)

- **Anyone with the publishable key can read & write all production
  data.** Acceptable for now (data is non-sensitive, key is in client
  JS). Defer real auth to a separate effort.
- **Catalog deletes (line/shift/operator) replace the whole array** when
  pushed to Supabase. Fine at current cardinality (2 lines, 2 shifts,
  N operators), but means concurrent admin edits race on last-write-wins.

### Acknowledged trade-offs (no action this sprint)

- 5-min pull-overlap window: misses backfills from devices offline >5
  min. Mitigated by watermark only advancing on successful pulls.
- Clock skew across devices: analyzed safe; no action.
- Shift not defined locally on receiving device: renders misaligned
  but doesn't crash.
- Storage growth: 30-day session retention via `pruneOldSessions()` is
  in place; Safari iOS cap is the binding constraint.

## 6. Sprint goals (next 2–3 weeks)

Pick the top 3-4. Everything is sized small (each <1 day of focused
work) so the team can slot them into a release cadence.

### S1 — Threshold alerts ("falling behind" notification)

**Why.** The existing hourly alerts are time-based ("it's 10am, log
data"). The real value is detecting that a line dropped below pace.
Line leaders walk past tablets that look fine until 2 hours in. A
threshold notification catches issues early.

**Spec.**
- New config setting `paceAlertThreshold` (default 75) and
  `paceAlertSustainMin` (default 15).
- When a line's running pace stays below `paceAlertThreshold` for
  `paceAlertSustainMin` continuous minutes, fire a local notification
  on the tablet + log a `pace_alert` event to Supabase.
- Dashboard cards show a small bell on lines with active alerts.
- Snoozable per operator like the existing hourly alert.

**Files.** `app.js` (alert logic), `sync.js` (event push), `i18n.js`,
`dashboard.js` (bell), `styles.css`.

**Acceptance.**
- Capture pieces at a rate ~50% of target for 15 min → alert fires,
  event row appears in Supabase, dashboard shows bell.
- Snooze button suppresses for 30 min by default.

**Risk.** Pace computation already exists; integration is the work.
Estimate: ½ day.

---

### S2 — Scrap-reason Pareto view

**Why.** Operators tag captures with notes (`Falta material`,
`Personal entrenamiento`, etc.). Today those notes live in the log
but aren't summarized. A weekly Pareto would tell the line leader
exactly where to coach.

**Spec.**
- New chart card on the Gráficas view: "Causas de Rechazo (últimos 7
  días)" — a horizontal bar chart, ordered descending, with absolute
  count + percent of total.
- Aggregation: scrap captures (`kind === "scrap"`) across all sessions
  in the trailing 7 days, grouped by note tag (`notes[0]` or "Sin
  causa" if empty), summing `qty`.
- Click a bar to filter the bitácora to that cause (existing search
  field).

**Files.** `app.js` (new `renderScrapPareto`), `styles.css`,
`i18n.js`.

**Acceptance.**
- With 30+ scrap captures across various notes, the chart shows top
  causes in descending order with both raw count and percentage.
- Cause with no notes is grouped as "Sin causa".

**Risk.** Existing chart infra (canvas helpers, rounded bars) covers
the drawing. Estimate: ½ day.

---

### S3 — Per-shift PDF report (one click)

**Why.** Currently `Exportar Día` produces a single CSV. Manager
hand-offs to ops / finance need a 1-page summary that's printable.

**Spec.**
- New button in Admin → Resumen → "PDF del Turno" (or Datos panel).
- Opens a print-friendly preview page (`/report.html?date=YYYY-MM-DD&line=L-XX`)
  rendered from local data + Supabase pull.
- Content: line + shift + operator header, totals (good / scrap / OEE
  / downtime min), hourly bar chart image, top 5 scrap causes, top 5
  downtime causes, page footer with generation timestamp.
- Use the browser's native `window.print()` to PDF — no server-side
  rendering.

**Files.** `report.html` (new), `report.js` (new), `styles.css`
(`@media print` block), `admin.html` (link in Resumen).

**Acceptance.**
- Manager picks a date+line in admin, clicks PDF button → new tab
  opens, print dialog appears.
- Saving to PDF produces a clean single page with all the listed
  content, no nav chrome.

**Risk.** Hourly chart needs to render at a fixed size for print.
Estimate: 1–1.5 days.

---

### S4 — Per-row catalog delete sync

**Why.** Today, editing a single line/operator on tablet A pushes
the whole array to Supabase. If admin on B is editing simultaneously,
last-write-wins clobbers one of them.

**Spec.**
- Switch `pushConfig` for catalogs to per-row UPSERT model with a
  `deleted_at` column. Settings (`hourlyTarget` etc.) stay as a
  single "settings" row.
- New SQL adds `deleted_at timestamptz` to a normalized
  `config_lines/config_shifts/config_operators` (or keep one table
  with composite key `(key, item_id)`).
- `applyRemote` materializes the array from non-deleted rows.

**Files.** `sync.js`, `app.js`, plus a SQL migration.

**Acceptance.**
- Tablet A renames line `L-60ML`. Tablet B simultaneously adds a new
  line. Both changes persist after sync.
- Deleting a line marks `deleted_at`; other devices remove it from
  their local copy.

**Risk.** Schema design call: composite vs. normalized. Estimate:
1–1.5 days. **Skip this sprint if S1/S2/S3 take longer than
expected.**

---

### S5 — i18n cleanup pass

**Why.** A few hardcoded Spanish strings remain (placeholder text,
some error alerts). The lang toggle is mostly silent on those.

**Spec.**
- Grep for hardcoded strings, move to i18n.
- Add a unit-ish check (a tiny dev script) that lists keys present
  in ES but missing in EN, and vice versa.

**Files.** `i18n.js`, mainly. ~30 minutes.

**Acceptance.** Toggling EN shows English everywhere except brand
names; ES↔EN dictionaries are symmetric.

**Risk.** Trivial. Estimate: ½ day.

## 7. Definition of done (per item)

Each sprint item ships as:
- A focused PR against `main`.
- Vercel preview green.
- Manual test plan in the PR description, executed by the author.
- No regressions on existing features (smoke-test the capture flow + dashboard).
- Cache-bust version bumped on changed pages.
- New i18n keys present for both ES and EN.

## 8. Out of scope this sprint (parked)

- Real user auth (Supabase Auth or custom). Big lift. Track separately.
- Multi-plant / multi-tenant. Not a need yet.
- Power BI / Looker direct connector. Manager can use Supabase's read
  endpoints today via service-role key.
- Native mobile app. PWA suffices.
- Operator-level performance leaderboard. Punted; politically sensitive.

## 9. Open questions for the team

1. **Which 3 sprint items to commit to?** Default recommendation:
   **S1 + S2 + S3**, drop S4 to next sprint, slot S5 as fill.
2. **Default `paceAlertThreshold` and `paceAlertSustainMin`** —
   are 75% / 15min the right defaults for this plant?
3. **Report (S3) — should it email/Slack as a follow-up,** or is a
   manual PDF download enough for now?

## 10. Changelog / activity since v1

- `v=33` UX redesign: counter ring (reverted), animated counter, OEE
  donut, pulsing status, heatmap, EOS confetti, weekstrip date picker,
  responsive layer.
- `v=34` Replace `window.confirm` with non-blocking `appConfirm` (INP
  fix).
- `v=35` Day-reset broadcast (cross-device wipe).
- `v=38` Admin polish (density, standardized buttons, collapsible
  cards).
- `v=39` Cache-bust fix.
- `v=41` 4-tab admin layout.
- `v=42` Reset Día Actual (Supabase + local) plus broadcast.
- `v=43` Multi-line dashboard (PR #13).
- `v=44` Config sync via Supabase (PR #14).
