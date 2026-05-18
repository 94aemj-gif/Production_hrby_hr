/* Supabase sync layer.
 *
 * Design rules:
 *  - localStorage is always the source of truth on the tablet. The app
 *    must keep working with no network at all.
 *  - Every write also gets queued for Supabase. The queue itself lives
 *    in localStorage so it survives reloads and reboots.
 *  - Inserts are idempotent: every row carries a client-generated id,
 *    and we send `Prefer: resolution=merge-duplicates` so retrying after
 *    a network blip never creates duplicates.
 *  - Captures are append-only in the DB. If an operator hits "Undo"
 *    within the 10s window (or an admin deletes one later), we record
 *    a separate event row instead of mutating the capture. Power BI
 *    can filter undone captures by joining on that event.
 *
 * Exposes window.sync with:
 *   registerDevice({ lineId, operatorId, name })
 *   pushCapture(capture, sessionContext)
 *   pushDowntime(downtime, sessionContext)
 *   pushEvent(event)
 *   pushCaptureUndone(captureId)   // tombstone event
 *   pushCaptureDeleted(captureId)  // tombstone event (admin)
 *   getStatus()        -> { enabled, pending, deviceId, lastSync, lastError, lastPull }
 *   flush()            -> force a flush attempt
 *   pull()             -> force a pull attempt
 *
 * Pull-sync (device <- Supabase):
 *  - Every PULL_INTERVAL_MS we fetch new rows from captures/downtime/events
 *    using a per-table timestamp watermark (with a small overlap window so
 *    backfills from offline devices aren't missed).
 *  - Merging into local state is delegated to window.app.applyRemote(payload).
 *  - Requires SELECT-to-anon RLS policies on captures/downtime/events.
 *
 * Emits window 'syncstatuschange' on every state change so the UI can
 * update the topbar indicator.
 */
(function () {
  "use strict";

  const URL = window.SUPABASE_URL || "";
  const KEY = window.SUPABASE_ANON_KEY || "";
  const ENABLED = !!(URL && KEY);

  const STORAGE = {
    DEVICE_ID:   "prod.sync.deviceId.v1",
    PENDING:     "prod.sync.pending.v1",
    DEAD_LETTER: "prod.sync.deadLetter.v1",
    TOMBSTONES:  "prod.sync.pendingTombstones.v1",
    LAST_SYNC:   "prod.sync.lastSync.v1",
    LAST_ERR:    "prod.sync.lastError.v1",
    PULL_WM:     "prod.sync.pullWatermark.v1",
    LAST_PULL:   "prod.sync.lastPull.v1",
    MIGRATION:   "prod.sync.migration.v1",
    TAB_LOCK:    "prod.sync.tabLock.v1",
  };
  const MIGRATION_VERSION = 1;

  const FLUSH_INTERVAL_MS = 30 * 1000;
  const PULL_INTERVAL_MS  = 30 * 1000;
  const PULL_OVERLAP_MS   = 5 * 60 * 1000; // re-fetch a 5min window on first page, dedupe by id
  const PULL_PAGE_SIZE    = 1000;
  const PULL_MAX_PAGES    = 20;            // safety cap: 20k rows per pull cycle
  const MAX_BATCH         = 25;
  const DEAD_LETTER_MAX   = 100;
  const TOMBSTONE_TTL_MS  = 7 * 24 * 60 * 60 * 1000;
  const TAB_LOCK_TTL_MS   = 15 * 1000;
  const TAB_ID = "tab-" + Math.random().toString(36).slice(2, 10);

  function load(k, fallback) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
    catch (_) { return fallback; }
  }
  function save(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) {
      if (e && (e.name === "QuotaExceededError" || /quota/i.test(String(e.message)))) {
        // Best-effort: record the failure so the topbar shows it. Don't recurse
        // through save() — write the error key directly with a short payload.
        try {
          localStorage.setItem(STORAGE.LAST_ERR, JSON.stringify({
            ts: new Date().toISOString(),
            message: "Storage full — could not save " + k,
          }));
        } catch (_) {}
        try {
          window.dispatchEvent(new CustomEvent("syncstatuschange", {
            detail: { enabled: ENABLED, pending: (pending || []).length, deviceId,
                      lastSync, lastError: { message: "Storage full — could not save " + k }, lastPull },
          }));
        } catch (_) {}
      }
      return false;
    }
  }

  let deviceId = load(STORAGE.DEVICE_ID, null);
  let pending  = load(STORAGE.PENDING, []);
  let lastSync = load(STORAGE.LAST_SYNC, null);
  let lastError = load(STORAGE.LAST_ERR, null);
  let pullWm   = load(STORAGE.PULL_WM, { captures: null, downtime: null, events: null, config: null });
  if (pullWm && pullWm.config === undefined) pullWm.config = null;
  let lastPull = load(STORAGE.LAST_PULL, null);

  // One-shot migration: earlier versions advanced the watermark before the
  // log-merge code existed, so remote captures already pulled are not in the
  // local bitácora. Reset the watermark so the next pull re-fetches recent
  // rows. The merge step is idempotent (dedupe by id), so sessions won't
  // double-up — only the log will gain entries it was previously missing.
  if (load(STORAGE.MIGRATION, 0) < MIGRATION_VERSION) {
    pullWm = { captures: null, downtime: null, events: null };
    save(STORAGE.PULL_WM, pullWm);
    save(STORAGE.MIGRATION, MIGRATION_VERSION);
  }
  let flushTimer = null;
  let flushing = false;
  let pulling = false;

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback for very old browsers
    return "u-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  function emitStatus() {
    try {
      window.dispatchEvent(new CustomEvent("syncstatuschange", {
        detail: { enabled: ENABLED, pending: pending.length, deviceId, lastSync, lastError, lastPull }
      }));
    } catch (_) {}
  }

  function queue(table, row) {
    if (!ENABLED) return;
    pending.push({ table, row, queuedAt: new Date().toISOString() });
    save(STORAGE.PENDING, pending);
    emitStatus();
    scheduleFlush(500);
  }

  function scheduleFlush(delayMs) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, delayMs || 0);
  }

  async function postRows(table, rows) {
    const res = await fetch(URL + "/rest/v1/" + table, {
      method: "POST",
      headers: {
        "apikey": KEY,
        "Authorization": "Bearer " + KEY,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error("HTTP " + res.status + ": " + text.slice(0, 200));
      err.status = res.status;
      throw err;
    }
  }

  // Cross-tab cooperative lock so two tabs in the same browser don't
  // simultaneously flush/pull and clobber each other's localStorage writes.
  function acquireTabLock() {
    try {
      const raw = localStorage.getItem(STORAGE.TAB_LOCK);
      if (raw) {
        const cur = JSON.parse(raw);
        if (cur && cur.tabId !== TAB_ID && cur.expiresAt > Date.now()) return false;
      }
      localStorage.setItem(STORAGE.TAB_LOCK, JSON.stringify({
        tabId: TAB_ID, expiresAt: Date.now() + TAB_LOCK_TTL_MS,
      }));
      return true;
    } catch (_) { return true; } // can't lock; let it proceed
  }
  function releaseTabLock() {
    try {
      const raw = localStorage.getItem(STORAGE.TAB_LOCK);
      if (!raw) return;
      const cur = JSON.parse(raw);
      if (cur && cur.tabId === TAB_ID) localStorage.removeItem(STORAGE.TAB_LOCK);
    } catch (_) {}
  }

  function deadLetter(item, err) {
    const dl = load(STORAGE.DEAD_LETTER, []);
    dl.push({
      item,
      error: { status: err && err.status, message: String((err && err.message) || err).slice(0, 300) },
      droppedAt: new Date().toISOString(),
    });
    if (dl.length > DEAD_LETTER_MAX) dl.splice(0, dl.length - DEAD_LETTER_MAX);
    save(STORAGE.DEAD_LETTER, dl);
  }

  function isPermanent(status) {
    return status === 400 || status === 409 || status === 422;
  }

  async function flush() {
    if (!ENABLED || flushing || !pending.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!acquireTabLock()) return;
    flushing = true;
    try {
      while (pending.length) {
        const head = pending[0];
        const batch = [head];
        while (batch.length < MAX_BATCH
               && pending[batch.length]
               && pending[batch.length].table === head.table) {
          batch.push(pending[batch.length]);
        }
        try {
          await postRows(head.table, batch.map((b) => b.row));
          pending.splice(0, batch.length);
          save(STORAGE.PENDING, pending);
          lastSync = new Date().toISOString();
          save(STORAGE.LAST_SYNC, lastSync);
          if (lastError) { lastError = null; save(STORAGE.LAST_ERR, null); }
          emitStatus();
          continue;
        } catch (e) {
          // Permanent failure (bad data / constraint violation): isolate the
          // bad row. If the batch had only one row, dead-letter it directly;
          // otherwise retry just the head to see which row is poison.
          if (isPermanent(e.status) && batch.length === 1) {
            deadLetter(head, e);
            pending.shift();
            save(STORAGE.PENDING, pending);
            lastError = { ts: new Date().toISOString(),
              message: "Dropped 1 bad row to dead-letter (" + e.status + ")" };
            save(STORAGE.LAST_ERR, lastError);
            emitStatus();
            continue;
          }
          if (isPermanent(e.status) && batch.length > 1) {
            try {
              await postRows(head.table, [head.row]);
              pending.shift();
              save(STORAGE.PENDING, pending);
              continue;
            } catch (e2) {
              if (isPermanent(e2.status)) {
                deadLetter(head, e2);
                pending.shift();
                save(STORAGE.PENDING, pending);
                lastError = { ts: new Date().toISOString(),
                  message: "Dropped 1 bad row to dead-letter (" + e2.status + ")" };
                save(STORAGE.LAST_ERR, lastError);
                emitStatus();
                continue;
              }
              // Transient on the isolated retry: fall through to break.
              e = e2;
            }
          }
          // Transient failure (network / 5xx / auth): keep the row, retry next cycle.
          lastError = { ts: new Date().toISOString(), message: String(e && e.message || e) };
          save(STORAGE.LAST_ERR, lastError);
          emitStatus();
          break;
        }
      }
    } finally {
      flushing = false;
      releaseTabLock();
    }
  }

  function registerDevice(info) {
    if (!ENABLED) { emitStatus(); return; }
    if (!deviceId) {
      deviceId = newId();
      save(STORAGE.DEVICE_ID, deviceId);
    }
    queue("devices", {
      id: deviceId,
      name: (info && info.name) || ("Tablet " + deviceId.slice(0, 8)),
      line_id: (info && info.lineId) || null,
      operator_id: (info && info.operatorId) || null,
      last_seen_at: new Date().toISOString(),
    });
  }

  function pushCapture(c, ctx) {
    if (!ENABLED || !ctx) return;
    queue("captures", {
      id: c.id,
      device_id: deviceId,
      session_date: ctx.date,
      line_id: ctx.lineId,
      shift_id: ctx.shiftId,
      operator_id: ctx.operatorId || null,
      employee_id: c.employeeId || null,
      ts: c.ts,
      for_hour: c.forHour || null,
      qty: c.qty,
      kind: c.kind,
      notes: c.notes && c.notes.length ? c.notes : null,
      undone: !!c.undone,
    });
  }

  function pushDowntime(d, ctx) {
    if (!ENABLED || !ctx) return;
    queue("downtime", {
      // Allow the caller to provide a stable id (matches the local row's id
      // so the capture form's manual downtime entries don't double-insert
      // on retry). Falls back to a fresh id for the topbar status flow.
      id: d.id || newId(),
      device_id: deviceId,
      session_date: ctx.date,
      line_id: ctx.lineId,
      shift_id: ctx.shiftId,
      start_ts: d.start,
      end_ts: d.end || null,
      status: d.status || null,
      reason: d.reason || null,
      duration_ms: d.durationMs || null,
    });
  }

  function pushEvent(e) {
    if (!ENABLED) return;
    queue("events", {
      id: newId(),
      device_id: deviceId,
      ts: e.ts || new Date().toISOString(),
      type: e.type,
      message: e.message || null,
      capture_id: e.captureId || null,
    });
  }

  // Push a single config row to Supabase (UPSERT by key). Used to sync
  // line / shift / operator / settings catalogs across devices. Requires
  // table public.config with anon SELECT + INSERT + UPDATE policies.
  function pushConfig(key, value) {
    if (!ENABLED) return;
    if (!key) return;
    queue("config", {
      key: key,
      value: value,
      updated_at: new Date().toISOString(),
      updated_by: deviceId || null,
    });
  }

  function pushCaptureUndone(captureId) {
    pushEvent({ type: "capture_undone", message: "Operator undo", captureId });
  }
  function pushCaptureDeleted(captureId) {
    pushEvent({ type: "capture_deleted", message: "Admin delete", captureId });
  }

  function getStatus() {
    return {
      enabled: ENABLED, pending: pending.length,
      deadLettered: (load(STORAGE.DEAD_LETTER, []) || []).length,
      deviceId, lastSync, lastError, lastPull,
    };
  }

  // ---- Pull (Supabase -> device) ----

  // Paginated pull. First page uses gte.(wm - overlap) to catch backfills from
  // devices that flushed older rows late. Subsequent pages use strict gt. so we
  // don't infinite-loop. Returns the full set of rows across pages.
  async function pullTable(table, tsCol) {
    const allRows = [];
    let loopWm = pullWm[table];
    let firstPage = true;
    for (let page = 0; page < PULL_MAX_PAGES; page++) {
      const params = new URLSearchParams();
      params.set("select", "*");
      if (loopWm) {
        if (firstPage) {
          const fromTs = new Date(Math.max(0, new Date(loopWm).getTime() - PULL_OVERLAP_MS)).toISOString();
          params.set(tsCol, "gte." + fromTs);
        } else {
          params.set(tsCol, "gt." + loopWm);
        }
      }
      params.set("order", tsCol + ".asc");
      params.set("limit", String(PULL_PAGE_SIZE));
      const res = await fetch(URL + "/rest/v1/" + table + "?" + params.toString(), {
        headers: { "apikey": KEY, "Authorization": "Bearer " + KEY },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error("HTTP " + res.status + ": " + text.slice(0, 200));
        err.status = res.status;
        throw err;
      }
      const rows = await res.json();
      if (!rows.length) break;
      allRows.push.apply(allRows, rows);
      const maxTs = rows[rows.length - 1][tsCol];
      if (maxTs) {
        loopWm = maxTs;
        if (!pullWm[table] || maxTs > pullWm[table]) pullWm[table] = maxTs;
      }
      firstPage = false;
      if (rows.length < PULL_PAGE_SIZE) break;
    }
    return allRows;
  }

  // Pending tombstones: undo/delete events that arrived before the matching
  // capture row. We hold them and applyRemote consumes them when the capture
  // finally lands. Keyed by capture_id; values include a ts so we can expire.
  function loadTombstones() { return load(STORAGE.TOMBSTONES, {}); }
  function saveTombstones(t) { save(STORAGE.TOMBSTONES, t); }
  function pruneTombstones(t) {
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    let changed = false;
    for (const k of Object.keys(t)) {
      const ts = t[k] && t[k].ts;
      if (ts && new Date(ts).getTime() < cutoff) { delete t[k]; changed = true; }
    }
    return changed;
  }

  async function pull() {
    if (!ENABLED || pulling) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!acquireTabLock()) return;
    pulling = true;
    try {
      // Config pulls separately because failures there (e.g. table missing
      // before the user runs the migration SQL) shouldn't break the rest.
      let config = [];
      try {
        config = await pullTable("config", "updated_at");
      } catch (e) {
        // Surface but don't stop the main pull.
        lastError = { ts: new Date().toISOString(),
          message: "config pull: " + String((e && e.message) || e).slice(0, 200) };
        save(STORAGE.LAST_ERR, lastError);
      }
      const [captures, downtime, events] = await Promise.all([
        pullTable("captures", "ts"),
        pullTable("downtime", "start_ts"),
        pullTable("events",   "ts"),
      ]);
      save(STORAGE.PULL_WM, pullWm);
      lastPull = new Date().toISOString();
      save(STORAGE.LAST_PULL, lastPull);
      if (window.app && typeof window.app.applyRemote === "function") {
        try {
          window.app.applyRemote({ captures, downtime, events, config, ownDeviceId: deviceId });
        } catch (e) {
          // Surface renderer errors so they aren't silently lost.
          lastError = { ts: new Date().toISOString(),
            message: "applyRemote: " + String((e && e.message) || e).slice(0, 200) };
          save(STORAGE.LAST_ERR, lastError);
        }
      }
      // Expire ancient pending tombstones.
      const t = loadTombstones();
      if (pruneTombstones(t)) saveTombstones(t);
      emitStatus();
    } catch (e) {
      lastError = { ts: new Date().toISOString(), message: "pull: " + String(e && e.message || e) };
      save(STORAGE.LAST_ERR, lastError);
      emitStatus();
    } finally {
      pulling = false;
      releaseTabLock();
    }
  }

  function getDeadLetter() { return load(STORAGE.DEAD_LETTER, []); }
  function clearDeadLetter() { save(STORAGE.DEAD_LETTER, []); emitStatus(); }

  // Hard-delete all rows for a given session date in Supabase. Requires
  // DELETE RLS policies on captures/downtime/events for the anon role (see
  // README for the SQL). Also drops any pending pushes for that date so the
  // delete doesn't immediately get re-populated.
  // Drop pending items for a date so the queue doesn't re-populate after a
  // delete (used by deleteDate locally, and by applyRemote when a peer
  // broadcasts a day_reset event).
  function purgePendingForDate(iso) {
    if (!iso) return;
    const keptPending = [];
    for (const p of pending) {
      const row = p.row || {};
      if ((p.table === "captures" || p.table === "downtime") && row.session_date === iso) continue;
      // Drop today's pushed events EXCEPT day_reset broadcasts (those must survive
      // so other devices see them — they carry the reset signal).
      if (p.table === "events"
          && typeof row.ts === "string" && row.ts.slice(0, 10) === iso
          && row.type !== "day_reset") continue;
      keptPending.push(p);
    }
    if (keptPending.length !== pending.length) {
      pending = keptPending;
      save(STORAGE.PENDING, pending);
    }
    const t = loadTombstones();
    let tChanged = false;
    for (const k of Object.keys(t)) {
      if (t[k] && typeof t[k].ts === "string" && t[k].ts.slice(0, 10) === iso) {
        delete t[k]; tChanged = true;
      }
    }
    if (tChanged) saveTombstones(t);
    emitStatus();
  }

  async function deleteDate(iso) {
    if (!ENABLED) return { ok: false, errors: ["sync disabled"] };
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { ok: false, errors: ["bad date"] };
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, errors: ["offline"] };
    }
    const dayStart = iso + "T00:00:00.000Z";
    const dayEnd   = iso + "T23:59:59.999Z";
    const errors = [];

    purgePendingForDate(iso);

    async function del(table, qs) {
      const res = await fetch(URL + "/rest/v1/" + table + "?" + qs, {
        method: "DELETE",
        headers: {
          "apikey": KEY,
          "Authorization": "Bearer " + KEY,
          "Prefer": "return=minimal",
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error("HTTP " + res.status + " " + text.slice(0, 200));
        err.status = res.status;
        throw err;
      }
    }

    try { await del("captures", "session_date=eq." + encodeURIComponent(iso)); }
    catch (e) { errors.push("captures: " + e.message); }
    try { await del("downtime", "session_date=eq." + encodeURIComponent(iso)); }
    catch (e) { errors.push("downtime: " + e.message); }
    try { await del("events", "ts=gte." + encodeURIComponent(dayStart) + "&ts=lte." + encodeURIComponent(dayEnd)); }
    catch (e) { errors.push("events: " + e.message); }

    // Broadcast: insert a day_reset event so other devices pick it up on
    // their next pull and apply the same wipe locally. Done AFTER the
    // deletes so the broadcast row itself survives.
    if (errors.length === 0 && deviceId) {
      try {
        await postRows("events", [{
          id: newId(),
          device_id: deviceId,
          ts: new Date().toISOString(),
          type: "day_reset",
          message: iso,
          capture_id: null,
        }]);
      } catch (e) {
        errors.push("broadcast: " + e.message);
      }
    }

    emitStatus();
    return { ok: errors.length === 0, errors };
  }

  // Try to flush whenever the network comes back.
  window.addEventListener("online", () => { scheduleFlush(0); pull(); });
  // Periodic retry.
  setInterval(() => { scheduleFlush(0); }, FLUSH_INTERVAL_MS);
  setInterval(pull, PULL_INTERVAL_MS);
  // Initial flush + pull a couple seconds after load (let i18n/app boot first).
  scheduleFlush(2000);
  setTimeout(pull, 2500);

  window.sync = {
    registerDevice, pushCapture, pushDowntime, pushEvent,
    pushCaptureUndone, pushCaptureDeleted,
    pushConfig,
    getStatus, flush, pull,
    getDeadLetter, clearDeadLetter,
    deleteDate, purgePendingForDate,
  };

  // Announce initial state so the UI can render immediately.
  setTimeout(emitStatus, 0);
})();
