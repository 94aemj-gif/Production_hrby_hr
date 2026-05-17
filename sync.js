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
 *   getStatus()        -> { enabled, pending, deviceId, lastSync, lastError }
 *   flush()            -> force a flush attempt
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
    DEVICE_ID: "prod.sync.deviceId.v1",
    PENDING:   "prod.sync.pending.v1",
    LAST_SYNC: "prod.sync.lastSync.v1",
    LAST_ERR:  "prod.sync.lastError.v1",
  };

  const FLUSH_INTERVAL_MS = 30 * 1000;
  const MAX_BATCH = 25;

  function load(k, fallback) {
    try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); }
    catch (_) { return fallback; }
  }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }

  let deviceId = load(STORAGE.DEVICE_ID, null);
  let pending  = load(STORAGE.PENDING, []);
  let lastSync = load(STORAGE.LAST_SYNC, null);
  let lastError = load(STORAGE.LAST_ERR, null);
  let flushTimer = null;
  let flushing = false;

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    // Fallback for very old browsers
    return "u-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  function emitStatus() {
    try {
      window.dispatchEvent(new CustomEvent("syncstatuschange", {
        detail: { enabled: ENABLED, pending: pending.length, deviceId, lastSync, lastError }
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

  async function flush() {
    if (!ENABLED || flushing || !pending.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    flushing = true;
    try {
      // Group consecutive items by table for batched POSTs.
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
        } catch (e) {
          lastError = { ts: new Date().toISOString(), message: String(e && e.message || e) };
          save(STORAGE.LAST_ERR, lastError);
          emitStatus();
          break; // Stop on first failure; retry on next interval.
        }
      }
    } finally {
      flushing = false;
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
      id: newId(),
      device_id: deviceId,
      session_date: ctx.date,
      line_id: ctx.lineId,
      shift_id: ctx.shiftId,
      start_ts: d.start,
      end_ts: d.end || null,
      status: d.status || null,
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

  function pushCaptureUndone(captureId) {
    pushEvent({ type: "capture_undone", message: "Operator undo", captureId });
  }
  function pushCaptureDeleted(captureId) {
    pushEvent({ type: "capture_deleted", message: "Admin delete", captureId });
  }

  function getStatus() {
    return { enabled: ENABLED, pending: pending.length, deviceId, lastSync, lastError };
  }

  // Try to flush whenever the network comes back.
  window.addEventListener("online", () => scheduleFlush(0));
  // Periodic retry.
  setInterval(() => { scheduleFlush(0); }, FLUSH_INTERVAL_MS);
  // Initial flush a couple seconds after load (let i18n/app boot first).
  scheduleFlush(2000);

  window.sync = {
    registerDevice, pushCapture, pushDowntime, pushEvent,
    pushCaptureUndone, pushCaptureDeleted,
    getStatus, flush,
  };

  // Announce initial state so the UI can render immediately.
  setTimeout(emitStatus, 0);
})();
