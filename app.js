/* Pantalla de Registro de Producción - v2
 * Sesiones por (fecha, línea, turno, operador). Persistencia localStorage.
 * Features: multi-línea/turno, login con PIN, scrap, paro, deshacer, historial, filtro, chart, PWA.
 */
(function () {
  "use strict";

  const STORAGE = {
    CONFIG: "prod.config.v1",
    LINES: "prod.lines.v1",
    SHIFTS: "prod.shifts.v1",
    OPERATORS: "prod.operators.v1",
    DEVICE: "prod.device.v1",
    SESSIONS: "prod.sessions.v1",
    LOG: "prod.log.v1",
    PENDING: "prod.pending.v1",
    SNOOZE: "prod.snooze.v1",
    LAST_FIRED: "prod.lastFired.v1",
    LEGACY_COUNTER: "prod.counter.v1",
    LEGACY_CURRENT: "prod.session.current.v1",
  };

  const LOG_MAX = 500;
  const UNDO_WINDOW_MS = 10 * 1000;

  const DEFAULT_CONFIG = {
    alertTimes: ["09:00", "12:00", "15:00", "18:00"],
    snoozeMinutes: 5,
    hourlyTarget: 420,
    audioEnabled: true,
    audioVolume: 0.6,
  };

  const DEFAULT_LINES = [
    { id: "L-01", label: "Línea 01" },
    { id: "L-02", label: "Línea 02" },
    { id: "L-03", label: "Línea 03" },
  ];

  // days: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  // Lun-Jue = regular. Vie/Sáb/Dom = tiempo extra (computed display).
  // breaks: [{start:"HH:MM", end:"HH:MM"}] within shift window (HH:MM after midnight for overnight shifts)
  const DEFAULT_SHIFTS = [
    { id: "S1", label: "Turno 1", startTime: "06:00", endTime: "18:00", days: [0, 1, 2, 3, 4, 5, 6],
      breaks: [{ start: "10:00", end: "10:15" }, { start: "13:00", end: "13:15" }] },
    { id: "S2", label: "Turno 2", startTime: "18:30", endTime: "05:00", days: [0, 1, 2, 3, 4, 5, 6],
      breaks: [{ start: "22:00", end: "22:15" }, { start: "01:30", end: "01:45" }] },
  ];

  const NOTE_KEYS = ["notes.training", "notes.meeting", "notes.noMaterial"];
  function tt(key, params) { return (window.i18n && window.i18n.t) ? window.i18n.t(key, params) : key; }
  function getLocale() { return (window.i18n && window.i18n.locale) ? window.i18n.locale() : "es-MX"; }

  function isOvertimeDate(dateStr) {
    const [Y, M, D] = dateStr.split("-").map(Number);
    const dow = new Date(Y, M - 1, D).getDay();
    return dow === 0 || dow === 5 || dow === 6;
  }

  const DEFAULT_OPERATORS = [
    { id: "OP-0847", name: "Operador Demo" },
  ];

  function statusLabel(code) {
    return tt({
      Running: "top.statusOpt.running",
      Idle: "top.statusOpt.idle",
      Maintenance: "top.statusOpt.maintenance",
      Breakdown: "top.statusOpt.breakdown",
    }[code] || code);
  }

  // ---- Storage helpers ----
  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) { return fallback; }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) {
      if (e && (e.name === "QuotaExceededError" || /quota/i.test(String(e.message)))) {
        // Surface to the sync indicator via lastError, since it polls/displays it.
        try {
          localStorage.setItem("prod.sync.lastError.v1", JSON.stringify({
            ts: new Date().toISOString(),
            message: "Storage full — could not save " + key,
          }));
          window.dispatchEvent(new Event("syncstatuschange"));
        } catch (_) {}
      }
      return false;
    }
  };

  // ---- State ----
  let config = Object.assign({}, DEFAULT_CONFIG, load(STORAGE.CONFIG, {}));
  let lines = load(STORAGE.LINES, DEFAULT_LINES);
  let shifts = load(STORAGE.SHIFTS, DEFAULT_SHIFTS);
  let operators = load(STORAGE.OPERATORS, DEFAULT_OPERATORS);
  let device = load(STORAGE.DEVICE, { lineId: lines[0] && lines[0].id, operatorId: operators[0] && operators[0].id });
  let current = null;
  let snoozeUntil = load(STORAGE.SNOOZE, 0);
  let lastFired = load(STORAGE.LAST_FIRED, {});
  let activeAlertTime = null;
  let logFilterType = "all";
  let logFilterText = "";
  let undoTimer = null;

  // Legacy migration: old single counter -> ignored; new sessions start fresh.

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);

  // ---- Session helpers ----
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function nowHourKey() { return new Date().toISOString().slice(0, 13); }

  function sessionKey(s) { return s.date + "|" + s.lineId + "|" + s.shiftId + "|" + s.operatorId; }

  function loadSessions() { return load(STORAGE.SESSIONS, []); }
  function saveSessions(arr) { save(STORAGE.SESSIONS, arr); }

  function getSession() {
    if (!current) return null;
    const all = loadSessions();
    return all.find((s) => sessionKey(s) === sessionKey(current)) || null;
  }

  function updateSession(mutator) {
    if (!current) return null;
    const all = loadSessions();
    const k = sessionKey(current);
    let idx = all.findIndex((s) => sessionKey(s) === k);
    let s;
    if (idx === -1) {
      s = newSessionShell(current);
      all.push(s);
      idx = all.length - 1;
    } else {
      s = all[idx];
    }
    mutator(s);
    s.updatedAt = new Date().toISOString();
    all[idx] = s;
    saveSessions(all);
    return s;
  }

  function newSessionShell(cur) {
    const sh = shifts.find((x) => x.id === cur.shiftId);
    const alertTimes = sh && sh.startTime && sh.endTime
      ? generateHourlyAlerts(sh.startTime, sh.endTime)
      : config.alertTimes.slice();
    return {
      date: cur.date,
      lineId: cur.lineId,
      shiftId: cur.shiftId,
      operatorId: cur.operatorId,
      startedAt: new Date().toISOString(),
      endedAt: null,
      goodCount: 0,
      scrapCount: 0,
      hourValue: 0,
      hourStart: nowHourKey(),
      hourly: {},
      captures: [],
      submissions: [],
      downtime: [],
      currentStatus: "Running",
      alertTimes,
      updatedAt: new Date().toISOString(),
    };
  }

  function activeAlertTimes() {
    const s = getSession();
    if (s && s.alertTimes && s.alertTimes.length) return s.alertTimes;
    return config.alertTimes;
  }

  function getShiftWindow(s) {
    const sh = shifts.find((x) => x.id === s.shiftId);
    const [Y, M, D] = s.date.split("-").map(Number);
    if (!sh || !sh.startTime || !sh.endTime) {
      const start = new Date(s.startedAt);
      const end = new Date(start.getTime() + 12 * 3600000);
      return { start, end };
    }
    const [sH, sM] = sh.startTime.split(":").map(Number);
    const [eH, eM] = sh.endTime.split(":").map(Number);
    const start = new Date(Y, M - 1, D, sH, sM, 0, 0);
    let end = new Date(Y, M - 1, D, eH, eM, 0, 0);
    if (end <= start) end = new Date(end.getTime() + 86400000);
    return { start, end };
  }

  function shiftTotals(s) {
    const { start, end } = getShiftWindow(s);
    let good = 0, scrap = 0;
    for (const c of s.captures || []) {
      if (c.undone) continue;
      const hk = captureForHour(c);
      const bucketDate = new Date(hk + ":00:00Z");
      if (bucketDate < start || bucketDate >= end) continue;
      if (c.kind === "scrap") scrap += c.qty; else good += c.qty;
    }
    return { good, scrap };
  }

  // forHour rule: capture at HH:MM represents previous hour if MM < 30, else current hour.
  // Result is the hour ISO key (UTC) the capture should bucket into.

  function computeForHour(ts) {
    const d = new Date(ts);
    const adj = new Date(d);
    if (d.getMinutes() < 30) adj.setHours(d.getHours() - 1);
    adj.setMinutes(0, 0, 0);
    return hourKeyOf(adj);
  }

  function captureForHour(c) {
    return c.forHour || computeForHour(c.ts);
  }

  function shiftHourly(s) {
    const { start, end } = getShiftWindow(s);
    const buckets = {};
    for (const c of s.captures || []) {
      if (c.undone || c.kind === "scrap") continue;
      const hk = captureForHour(c);
      // bucket date check: convert key to date, must be within shift window
      const bucketDate = new Date(hk + ":00:00Z");
      if (bucketDate < start || bucketDate >= end) continue;
      buckets[hk] = (buckets[hk] || 0) + c.qty;
    }
    return buckets;
  }

  function isWithinShift(d, s) {
    const { start, end } = getShiftWindow(s);
    return d >= start && d < end;
  }

  // Returns break Date intervals (absolute) for the given session's shift
  function getShiftBreaks(s) {
    const sh = shifts.find((x) => x.id === s.shiftId);
    if (!sh || !sh.breaks || !sh.breaks.length) return [];
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const [Y, M, D] = s.date.split("-").map(Number);
    const [sH, sM] = (sh.startTime || "00:00").split(":").map(Number);
    const startMin = sH * 60 + sM;
    const out = [];
    for (const br of sh.breaks) {
      if (!br.start || !br.end) continue;
      const [bsH, bsM] = br.start.split(":").map(Number);
      const [beH, beM] = br.end.split(":").map(Number);
      const bsMin = bsH * 60 + bsM;
      const beMin = beH * 60 + beM;
      // overnight handling: if break time is "before" shift start clock time, push to next day
      let bs = new Date(Y, M - 1, D, bsH, bsM, 0, 0);
      let be = new Date(Y, M - 1, D, beH, beM, 0, 0);
      if (bsMin < startMin) bs = new Date(bs.getTime() + 86400000);
      if (beMin < startMin) be = new Date(be.getTime() + 86400000);
      if (be <= bs) be = new Date(be.getTime() + 86400000);
      // clip to shift window
      if (be <= shStart || bs >= shEnd) continue;
      const clipS = bs > shStart ? bs : shStart;
      const clipE = be < shEnd ? be : shEnd;
      out.push({ start: clipS, end: clipE });
    }
    return out;
  }

  // Sum of break milliseconds overlapping [from, to]
  function breakOverlapMs(s, from, to) {
    const breaks = getShiftBreaks(s);
    let total = 0;
    for (const b of breaks) {
      const cs = b.start > from ? b.start : from;
      const ce = b.end < to ? b.end : to;
      const d = ce - cs;
      if (d > 0) total += d;
    }
    return total;
  }

  // Effective per-hour target reduced by break minutes overlapping that hour
  function effectiveHourTarget(s, hourStart) {
    const target = config.hourlyTarget;
    if (target <= 0) return 0;
    const hourEnd = new Date(hourStart.getTime() + 3600000);
    const breakMs = breakOverlapMs(s, hourStart, hourEnd);
    const breakFrac = breakMs / 3600000;
    return target * Math.max(0, 1 - breakFrac);
  }

  // Event types we DON'T push to Supabase (already captured in other tables or pure noise).
  const SYNC_SKIP_TYPES = { capture: 1, scrap: 1, undo: 1 };

  // ---- Log ----
  function logEvent(type, message, extra) {
    const entries = load(STORAGE.LOG, []);
    const entry = {
      ts: new Date().toISOString(),
      type,
      message,
      sessionRef: current ? sessionKey(current) : null,
    };
    if (extra) Object.assign(entry, extra);
    entries.push(entry);
    if (entries.length > LOG_MAX) entries.splice(0, entries.length - LOG_MAX);
    save(STORAGE.LOG, entries);
    renderLog();
    if (window.sync && window.sync.pushEvent && !SYNC_SKIP_TYPES[type]) {
      window.sync.pushEvent(entry);
    }
  }

  function renderLog() {
    const logListEl = $("log-list");
    if (!logListEl) return;
    const entries = load(STORAGE.LOG, []);
    const filtered = entries.filter((e) => {
      if (logFilterType !== "all" && e.type !== logFilterType) return false;
      if (logFilterText && !e.message.toLowerCase().includes(logFilterText)) return false;
      return true;
    });
    logListEl.innerHTML = "";
    if (!filtered.length) {
      const empty = document.createElement("li");
      empty.className = "log-empty";
      empty.textContent = entries.length ? tt("log.noMatches") : tt("log.empty");
      logListEl.appendChild(empty);
      return;
    }
    const isAdminPage = !$("counter");
    const delTitle = tt("log.delTitle");
    filtered.slice().reverse().forEach((e) => {
      const d = new Date(e.ts);
      const li = document.createElement("li");
      li.className = "log-item log-" + e.type;
      const canDelete = isAdminPage && e.captureId && (e.type === "capture" || e.type === "scrap");
      li.innerHTML =
        '<span class="log-time">' + fmt12(d, true) + "</span>" +
        '<span class="log-tag">' + logTagLabel(e.type) + "</span>" +
        '<span class="log-msg"></span>' +
        (canDelete ? '<button type="button" class="log-del" title="' + escapeHtml(delTitle) + '" data-cap="' + e.captureId + '">✕</button>' : "");
      li.querySelector(".log-msg").textContent = e.message;
      logListEl.appendChild(li);
    });
    logListEl.querySelectorAll(".log-del").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest(".log-item");
        const msg = row ? row.querySelector(".log-msg").textContent : "";
        const time = row ? row.querySelector(".log-time").textContent : "";
        if (!confirm(tt("log.delConfirm", { time, msg }))) return;
        deleteCapture(btn.dataset.cap);
      });
    });
  }

  function deleteCapture(captureId) {
    const all = loadSessions();
    let changed = false; let qty = 0; let kind = "";
    for (const s of all) {
      const i = (s.captures || []).findIndex((c) => c.id === captureId);
      if (i !== -1) {
        if (s.captures[i].undone) return;
        qty = s.captures[i].qty; kind = s.captures[i].kind;
        s.captures[i].undone = true;
        changed = true;
        break;
      }
    }
    if (changed) {
      saveSessions(all);
      logEvent("undo", tt(kind === "scrap" ? "log.adminDelScrap" : "log.adminDelPieces", { qty }));
      if (window.sync && window.sync.pushCaptureDeleted) window.sync.pushCaptureDeleted(captureId);
      renderLog();
      if (typeof renderHistory === "function") {
        const hd = $("history-date");
        if (hd) renderHistory(hd.value);
      }
    }
  }

  function logTagLabel(type) {
    const keyMap = {
      capture: "logTag.capture", scrap: "logTag.scrap", alert: "logTag.alert",
      snooze: "logTag.snooze", submit: "logTag.submit", adjust: "logTag.adjust",
      config: "logTag.config", clear: "logTag.clear", system: "logTag.system",
      downtime: "logTag.downtime", status: "logTag.status", session: "logTag.session",
      undo: "logTag.undo",
    };
    return keyMap[type] ? tt(keyMap[type]) : type;
  }

  function clearLog() {
    save(STORAGE.LOG, []);
    logEvent("system", tt("log.clearedManual"));
  }

  // ---- Time helpers ----
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtTime(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function fmt12(d, withSec) {
    let h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12; if (h === 0) h = 12;
    return h + ":" + pad2(m) + (withSec ? ":" + pad2(s) : "") + " " + ampm;
  }
  function fmt12FromHHMM(hhmm) {
    const [hh, mm] = hhmm.split(":").map(Number);
    const ampm = hh >= 12 ? "PM" : "AM";
    let h = hh % 12; if (h === 0) h = 12;
    return h + ":" + pad2(mm) + " " + ampm;
  }
  function fmtDate(d) {
    try {
      return d.toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    } catch (_) {
      return d.toISOString().slice(0, 10);
    }
  }
  function fmtTimeFull(d) { return fmt12(d, true); }
  function generateHourlyAlerts(startHHMM, endHHMM) {
    const [sH, sM] = startHHMM.split(":").map(Number);
    const [eH, eM] = endHHMM.split(":").map(Number);
    const startMin = sH * 60 + sM;
    let endMin = eH * 60 + eM;
    if (endMin <= startMin) endMin += 24 * 60;
    const alerts = [];
    let cur = (Math.floor(startMin / 60) + 1) * 60;
    while (cur <= endMin) {
      const m = cur % (24 * 60);
      alerts.push(pad2(Math.floor(m / 60)) + ":" + pad2(m % 60));
      cur += 60;
    }
    return alerts;
  }

  // ---- Auto shift detection ----
  function detectActiveShift(now) {
    const dow = now.getDay();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const sh of shifts) {
      if (!sh.startTime || !sh.endTime) continue;
      const [sH, sM] = sh.startTime.split(":").map(Number);
      const [eH, eM] = sh.endTime.split(":").map(Number);
      const startMin = sH * 60 + sM;
      const endMinRaw = eH * 60 + eM;
      const crossMid = endMinRaw <= startMin;
      const dowYesterday = (dow + 6) % 7;
      if (sh.days && sh.days.indexOf(dow) !== -1) {
        if (!crossMid && nowMin >= startMin && nowMin < endMinRaw) return sh;
        if (crossMid && nowMin >= startMin) return sh;
      }
      if (crossMid && sh.days && sh.days.indexOf(dowYesterday) !== -1) {
        if (nowMin < endMinRaw) return sh;
      }
    }
    return null;
  }

  function shiftStartDateKey(now, sh) {
    const [sH, sM] = sh.startTime.split(":").map(Number);
    const [eH, eM] = sh.endTime.split(":").map(Number);
    const startMin = sH * 60 + sM;
    const endMinRaw = eH * 60 + eM;
    const crossMid = endMinRaw <= startMin;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let d = new Date(now);
    if (crossMid && nowMin < endMinRaw) d = new Date(now.getTime() - 86400000);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function isShiftActive() { return !!current; }

  function ensureAutoSession() {
    const prevKey = current ? sessionKey(current) : null;
    const prevCurrent = current;
    if (!device.lineId || !device.operatorId) {
      if (prevCurrent) maybeShowEosFor(prevCurrent);
      current = null; return prevKey !== null;
    }
    const sh = detectActiveShift(new Date());
    if (!sh) {
      if (prevCurrent) maybeShowEosFor(prevCurrent);
      current = null; return prevKey !== null;
    }
    const date = shiftStartDateKey(new Date(), sh);
    const next = { date, lineId: device.lineId, shiftId: sh.id, operatorId: device.operatorId };
    const nextKey = sessionKey(next);
    if (prevKey === nextKey) return false;
    if (prevCurrent && prevKey !== nextKey) maybeShowEosFor(prevCurrent);
    current = next;
    const all = loadSessions();
    if (!all.find((s) => sessionKey(s) === nextKey)) {
      all.push(newSessionShell(current));
      saveSessions(all);
      logEvent("session", tt("log.sessionStarted", {
        line: lineLabel(current.lineId),
        shift: shiftLabel(current.shiftId),
        operator: operatorName(current.operatorId),
      }));
    }
    if (window.sync && window.sync.registerDevice) {
      window.sync.registerDevice({
        lineId: current.lineId,
        operatorId: current.operatorId,
        name: lineLabel(current.lineId),
      });
    }
    return true;
  }

  function maybeShowEosFor(prevCur) {
    if (!prevCur) return;
    const seenKey = "prod.eos.seen.v1";
    const seen = load(seenKey, {});
    const k = sessionKey(prevCur);
    if (seen[k]) return;
    seen[k] = true;
    save(seenKey, seen);
    const all = loadSessions();
    const s = all.find((x) => sessionKey(x) === k);
    if (!s) return;
    const totals = shiftTotals(s);
    const oee = computeOEE(s);
    const downMin = Math.round((s.downtime || []).reduce((a, d) => a + ((d.end ? new Date(d.end) : new Date()) - new Date(d.start)), 0) / 60000);
    setText("eos-shift", lineLabel(s.lineId) + " · " + shiftLabel(s.shiftId) + " · " + s.date);
    setText("eos-good", totals.good.toLocaleString());
    setText("eos-scrap", totals.scrap.toLocaleString());
    setText("eos-oee", oee + "%");
    setText("eos-down", tt("eos.min", { n: downMin }));
    const ov = $("eos-overlay");
    if (ov) { ov.classList.remove("hidden"); ov.setAttribute("aria-hidden", "false"); }
    // Show celebration banner + confetti AFTER the overlay is visible so
    // the canvas has real dimensions.
    setTimeout(() => showEosCelebration(s), 30);
    const btnX = $("btn-eos-close");
    const btnE = $("btn-eos-export");
    if (btnX) btnX.onclick = () => { ov.classList.add("hidden"); ov.setAttribute("aria-hidden", "true"); };
    if (btnE) btnE.onclick = () => exportSessionCSV(s);
  }

  function exportSessionCSV(s) {
    const totals = shiftTotals(s);
    const oee = computeOEE(s);
    const headers = ["fecha", "linea", "turno", "operador", "inicio", "fin", "produccion", "rechazos", "oee"];
    const rows = [[s.date, lineLabel(s.lineId), shiftLabel(s.shiftId), operatorName(s.operatorId), s.startedAt, s.endedAt || "", totals.good, totals.scrap, oee + "%"]];
    const csv = [headers, ...rows].map((r) => r.map((v) => {
      const str = String(v).replace(/"/g, '""');
      return /[,"\n]/.test(str) ? '"' + str + '"' : str;
    }).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "turno-" + s.date + "-" + s.shiftId + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function lineLabel(id) { const l = lines.find((x) => x.id === id); return l ? l.label : id; }
  function shiftLabel(id) { const s = shifts.find((x) => x.id === id); return s ? s.label : id; }
  function operatorName(id) { const o = operators.find((x) => x.id === id); return o ? o.name : id; }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---- Counter & rendering ----
  function rolloverHourIfNeeded(s) {
    const hk = nowHourKey();
    if (s.hourStart !== hk) {
      if (s.hourValue > 0) s.hourly[s.hourStart] = (s.hourly[s.hourStart] || 0) + s.hourValue;
      s.hourStart = hk;
      s.hourValue = 0;
    }
  }

  function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }
  function setDisabled(id, v) { const el = $(id); if (el) el.disabled = v; }

  // ---- Animated counter ----
  function animateCounter(val) {
    const el = $("counter");
    if (!el) return;
    if (typeof val !== "number" || !Number.isFinite(val)) {
      el.textContent = val == null ? "—" : String(val);
      el.dataset.current = "";
      return;
    }
    const target = val;
    const start = Number(el.dataset.current);
    if (!Number.isFinite(start)) { el.dataset.current = String(target); el.textContent = target.toLocaleString(); return; }
    if (start === target) { el.textContent = target.toLocaleString(); return; }
    el.dataset.current = String(target);
    const t0 = performance.now();
    const duration = Math.min(900, 250 + Math.abs(target - start) * 4);
    function step(t) {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const cur = Math.round(start + (target - start) * eased);
      el.textContent = cur.toLocaleString();
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    if (target > start) {
      el.classList.remove("counter-flash");
      void el.offsetWidth;
      el.classList.add("counter-flash");
    }
  }

  // ---- Hour progress (horizontal bar under the counter) ----
  function updateHourRing(s) {
    const fill  = $("hour-progress-fill");
    const cd    = $("hour-progress-countdown");
    const label = $("hour-progress-label");
    if (!fill || !cd || !label) return;
    if (!s) { fill.style.width = "0%"; cd.textContent = "—"; label.textContent = "—"; return; }
    const now = new Date();
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    if (now < shStart || now >= shEnd) {
      label.textContent = tt("counter.outOfShift");
      cd.textContent = "—";
      fill.style.width = "0%";
      return;
    }
    const hourStart = new Date(now); hourStart.setMinutes(0, 0, 0);
    const elapsedMs = now - hourStart;
    const pct = Math.min(100, Math.round((elapsedMs / 3600000) * 100));
    const minsLeft = Math.max(0, 60 - Math.floor(elapsedMs / 60000));
    let lh = hourStart.getHours();
    const ap = lh >= 12 ? "PM" : "AM";
    lh = lh % 12 || 12;
    let lh2 = (hourStart.getHours() + 1) % 24;
    const ap2 = lh2 >= 12 ? "PM" : "AM";
    lh2 = lh2 % 12 || 12;
    label.textContent = tt("counter.hourRange", { h1: lh, ap1: ap, h2: lh2, ap2: ap2 });
    cd.textContent    = tt("counter.minToCapture", { n: minsLeft });
    fill.style.width  = pct + "%";
    fill.style.background = pct >= 85 ? "var(--accent)" : "var(--blue)";
  }

  // ---- OEE donut (topbar) ----
  const OEE_RADIUS = 24;
  const OEE_CIRC = 2 * Math.PI * OEE_RADIUS;
  function updateOEEDonut(oeePct) {
    const arc  = $("oee-arc");
    const txt  = $("oee-pct");
    const wrap = $("oee-donut");
    if (!arc || !txt || !wrap) return;
    const v = Math.max(0, Math.min(100, Number.isFinite(oeePct) ? oeePct : 0));
    const len = (v / 100) * OEE_CIRC;
    arc.style.strokeDasharray = len + " " + Math.max(0.001, OEE_CIRC - len);
    arc.style.strokeDashoffset = "0";
    txt.textContent = Math.round(v) + "%";
    wrap.classList.remove("oee-low", "oee-mid", "oee-high");
    wrap.classList.add(v < 50 ? "oee-low" : v < 85 ? "oee-mid" : "oee-high");
  }

  // ---- Production heatmap (charts view) ----
  const HEATMAP_DAYS = 14;
  function renderHeatmap() {
    const wrap = $("heatmap");
    if (!wrap) return;
    const all = loadSessions();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dates = [];
    for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
      dates.push(new Date(today.getTime() - i * 86400000).toISOString().slice(0, 10));
    }
    const dateSet = new Set(dates);
    const grid = {};
    let maxVal = 0;
    for (const s of all) {
      if (!s || !s.captures || !dateSet.has(s.date)) continue;
      for (const c of s.captures) {
        if (c.undone || c.kind === "scrap") continue;
        const h = new Date(c.ts).getHours();
        grid[s.date] = grid[s.date] || {};
        grid[s.date][h] = (grid[s.date][h] || 0) + (Number(c.qty) || 0);
        if (grid[s.date][h] > maxVal) maxVal = grid[s.date][h];
      }
    }
    wrap.innerHTML = "";
    wrap.appendChild(document.createElement("div")); // top-left corner
    for (let h = 0; h < 24; h++) {
      const lbl = document.createElement("div");
      lbl.className = "heatmap-col-label";
      lbl.textContent = (h % 6 === 0) ? ((h % 12) || 12) + (h < 12 ? "a" : "p") : "";
      wrap.appendChild(lbl);
    }
    for (const d of dates) {
      const dd = new Date(d + "T00:00:00");
      const rowLbl = document.createElement("div");
      rowLbl.className = "heatmap-row-label";
      rowLbl.textContent = pad2(dd.getDate()) + "/" + pad2(dd.getMonth() + 1);
      wrap.appendChild(rowLbl);
      for (let h = 0; h < 24; h++) {
        const cell = document.createElement("div");
        cell.className = "heatmap-cell";
        const v = (grid[d] && grid[d][h]) || 0;
        let level = 0;
        if (maxVal > 0 && v > 0) {
          const r = v / maxVal;
          level = r < 0.2 ? 1 : r < 0.45 ? 2 : r < 0.75 ? 3 : 4;
        }
        cell.dataset.level = String(level);
        cell.title = d + " · " + (((h % 12) || 12) + (h < 12 ? "a" : "p")) + " — " + v.toLocaleString();
        wrap.appendChild(cell);
      }
    }
  }

  // ---- EOS celebration (banner + confetti when target met) ----
  function eosBannerKind(goodTotal, shiftTarget) {
    if (shiftTarget <= 0) return null;
    const ratio = goodTotal / shiftTarget;
    if (ratio >= 1.0) return "win";
    if (ratio >= 0.9) return "close";
    return "miss";
  }
  let confettiRaf = null;
  function runConfetti() {
    const cv = $("eos-confetti");
    if (!cv) return;
    const parent = cv.parentElement;
    const rect = parent ? parent.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
    cv.width = rect.width;
    cv.height = rect.height;
    const ctx = cv.getContext("2d");
    const colors = ["#1aa05a", "#1f7ee0", "#e07a2b", "#d23b4d", "#f4c430"];
    const pieces = [];
    for (let i = 0; i < 120; i++) {
      pieces.push({
        x: Math.random() * rect.width,
        y: -20 - Math.random() * rect.height * 0.5,
        vx: (Math.random() - 0.5) * 2,
        vy: 1 + Math.random() * 3,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        a: Math.random() * Math.PI * 2,
        va: (Math.random() - 0.5) * 0.25,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
    const t0 = performance.now();
    const DURATION = 4000;
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
    function step(t) {
      const elapsed = t - t0;
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const p of pieces) {
        p.vy += 0.04; p.x += p.vx; p.y += p.vy; p.a += p.va;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (elapsed < DURATION) confettiRaf = requestAnimationFrame(step);
      else { ctx.clearRect(0, 0, rect.width, rect.height); confettiRaf = null; }
    }
    confettiRaf = requestAnimationFrame(step);
  }
  function showEosCelebration(s) {
    const banner = $("eos-banner");
    if (!banner || !s) return;
    const totals = shiftTotals(s);
    const { start, end } = getShiftWindow(s);
    const shiftHours = Math.max(1, (end - start) / 3600000);
    const shiftTarget = (config.hourlyTarget || 0) * shiftHours;
    const kind = eosBannerKind(totals.good, shiftTarget);
    banner.classList.remove("eos-win", "eos-close", "eos-miss", "hidden");
    if (kind === "win") {
      banner.classList.add("eos-win");
      banner.textContent = "🎉  " + tt("eos.bannerWin");
      runConfetti();
    } else if (kind === "close") {
      banner.classList.add("eos-close");
      banner.textContent = "🏅  " + tt("eos.bannerClose");
    } else if (kind === "miss") {
      banner.classList.add("eos-miss");
      banner.textContent = tt("eos.bannerMiss");
    } else {
      banner.classList.add("hidden");
    }
  }

  function renderAll() {
    const s = getSession();
    const capBtn = $("btn-capture");
    if (!s) {
      setText("shift-label", device.lineId ? lineLabel(device.lineId) + " · " + tt("shift.noActive") : tt("shift.configDevice"));
      setText("operator-label", device.operatorId ? operatorName(device.operatorId) : "—");
      animateCounter("—");
      setText("scrap-count", "—");
      setText("metric-target", config.hourlyTarget);
      setText("metric-hour", "—");
      setText("metric-hour-range", "—");
      setText("metric-efficiency", "—");
      setText("metric-efficiency-sub", tt("counter.outOfShift"));
      setText("oee", "—");
      updateOEEDonut(0);
      setDisabled("equip-status", true);
      const pill = $("shift-status");
      if (pill) { pill.className = "status-pill status-paused"; pill.textContent = tt("status.outOfShift"); }
      renderSchedule();
      updateNextAlert();
      if (capBtn) capBtn.disabled = true;
      return;
    }
    if (capBtn) capBtn.disabled = false;
    setDisabled("equip-status", false);
    updateSession(rolloverHourIfNeeded);
    const fresh = getSession();
    const otSuffix = isOvertimeDate(fresh.date) ? " · " + tt("shift.overtime") : "";
    setText("shift-label", lineLabel(fresh.lineId) + " · " + shiftLabel(fresh.shiftId) + otSuffix);
    setText("operator-label", operatorName(fresh.operatorId));
    const totals = shiftTotals(fresh);
    animateCounter(totals.good);
    setText("scrap-count", totals.scrap.toLocaleString());
    setText("metric-target", config.hourlyTarget);

    const lastHour = getLastCompletedHour(fresh);
    setText("metric-hour", lastHour.value.toLocaleString());
    setText("metric-hour-range", lastHour.label);
    const hourEl = $("metric-hour");
    if (hourEl && config.hourlyTarget > 0 && lastHour.value > 0) {
      const pct = (lastHour.value / config.hourlyTarget) * 100;
      hourEl.style.color = pct >= 90 ? "var(--green)" : pct >= 60 ? "var(--blue)" : "var(--red)";
    } else if (hourEl) {
      hourEl.style.color = "var(--muted)";
    }

    const shiftEff = computeShiftEfficiency(fresh);
    setText("metric-efficiency", shiftEff.pct + "%");
    const effEl = $("metric-efficiency");
    if (effEl) effEl.style.color = shiftEff.pct >= 90 ? "var(--green)" : shiftEff.pct >= 60 ? "var(--blue)" : "var(--accent)";
    setText("metric-efficiency-sub", tt(shiftEff.completedHours === 1 ? "metric.hrComplete" : "metric.hrsComplete", { n: shiftEff.completedHours }));

    const oeePct = computeOEE(fresh);
    setText("oee", oeePct + "%");
    updateOEEDonut(oeePct);
    const eqs = $("equip-status"); if (eqs) eqs.value = fresh.currentStatus;
    applyStatusPill(fresh.currentStatus);
    renderChart(fresh);
    renderSchedule();
    updateNextAlert();
    updateUndoButton(fresh);

    // Behind tint
    const card = $("counter-card");
    if (card) {
      const behind = lastHour.value > 0 && config.hourlyTarget > 0 && (lastHour.value / config.hourlyTarget) < 0.6;
      card.classList.toggle("behind", behind);
    }
    // Empty state
    const emptyEl = $("counter-empty");
    if (emptyEl) emptyEl.classList.toggle("hidden", totals.good > 0);
    // Hour-in-progress bar + countdown
    updateHourRing(fresh);
    // Last capture row
    const last = getLastUserCapture(fresh);
    const lastEl = $("last-capture");
    const lastText = $("last-capture-text");
    if (lastEl && lastText) {
      if (last) {
        const ts = new Date(last.ts);
        lastText.textContent = tt(last.kind === "scrap" ? "counter.lastCapture.scrap" : "counter.lastCapture.good",
          { emp: last.employeeId, qty: last.qty, time: fmt12(ts) });
        lastEl.classList.remove("hidden");
      } else {
        lastEl.classList.add("hidden");
      }
    }
  }

  function hourKeyOf(d) { return d.toISOString().slice(0, 13); }

  function getLastCompletedHour(s) {
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const now = new Date();
    const prev = new Date(now);
    prev.setMinutes(0, 0, 0);
    prev.setHours(prev.getHours() - 1);
    const prevEnd = new Date(prev); prevEnd.setHours(prevEnd.getHours() + 1);
    if (prev < shStart || prevEnd > shEnd) {
      return { value: 0, label: "—", key: null };
    }
    const hourly = shiftHourly(s);
    const value = hourly[hourKeyOf(prev)] || 0;
    return { value, label: fmt12(prev) + " – " + fmt12(prevEnd), key: hourKeyOf(prev) };
  }

  function computeShiftEfficiency(s) {
    const target = config.hourlyTarget;
    if (target <= 0) return { pct: 0, completedHours: 0, sum: 0 };
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const currentHourStart = new Date(); currentHourStart.setMinutes(0, 0, 0);
    const endIter = currentHourStart < shEnd ? currentHourStart : shEnd;
    const startHour = new Date(shStart); startHour.setMinutes(0, 0, 0);
    const hourly = shiftHourly(s);
    let sum = 0; let completed = 0; let targetSum = 0;
    for (let t = new Date(startHour); t < endIter; t.setHours(t.getHours() + 1)) {
      if (t < shStart) continue;
      sum += hourly[hourKeyOf(t)] || 0;
      targetSum += effectiveHourTarget(s, t);
      completed += 1;
    }
    if (completed === 0 || targetSum <= 0) return { pct: 0, completedHours: 0, sum: 0 };
    const pct = Math.round((sum / targetSum) * 100);
    return { pct, completedHours: completed, sum };
  }

  function applyStatusPill(status) {
    const pill = $("shift-status");
    if (!pill) return;
    pill.className = "status-pill";
    if (status === "Running")          { pill.classList.add("status-active", "status-running");   pill.textContent = tt("status.active"); }
    else if (status === "Idle")        { pill.classList.add("status-paused", "status-idle");       pill.textContent = tt("status.idle"); }
    else if (status === "Maintenance") { pill.classList.add("status-completed", "status-maint");   pill.textContent = tt("status.maintenance"); }
    else if (status === "Breakdown")   { pill.classList.add("status-paused", "status-breakdown");  pill.textContent = tt("status.breakdown"); }
  }

  // ---- OEE (availability * performance * quality) within shift window ----
  function computeOEE(s) {
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const now = new Date();
    const endCap = now < shEnd ? now : shEnd;
    if (endCap <= shStart) return 0;
    // Subtract scheduled breaks: planned production time = elapsed - scheduled breaks elapsed
    const breakMs = breakOverlapMs(s, shStart, endCap);
    const plannedMs = Math.max(1, (endCap - shStart) - breakMs);
    const downMs = (s.downtime || []).reduce((acc, d) => {
      const ds = new Date(d.start);
      const de = d.end ? new Date(d.end) : now;
      const clipS = ds > shStart ? ds : shStart;
      const clipE = de < endCap ? de : endCap;
      return acc + Math.max(0, clipE - clipS);
    }, 0);
    const availability = Math.max(0, (plannedMs - downMs) / plannedMs);
    const runHours = Math.max(1 / 3600, (plannedMs - downMs) / 3600000);
    const expected = config.hourlyTarget * runHours;
    const totals = shiftTotals(s);
    const performance = expected > 0 ? Math.min(1, (totals.good + totals.scrap) / expected) : 0;
    const total = totals.good + totals.scrap;
    const quality = total > 0 ? totals.good / total : 1;
    return Math.round(availability * performance * quality * 100);
  }

  // ---- Chart (last 8 hours sparkline) ----
  function renderChart(s) {
    drawShiftChart($("hour-chart"), s);
  }

  // ---- Charts (live KPI view) ----
  function fitCanvas(cv) {
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    cv.width = rect.width * dpr;
    cv.height = rect.height * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx, w: rect.width, h: rect.height };
  }

  function drawCumulativeChart(cv, s) {
    if (!cv || !s) return;
    const { ctx, w, h } = fitCanvas(cv);
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const now = new Date();
    const startHour = new Date(shStart); startHour.setMinutes(0, 0, 0);
    const endIter = now < shEnd ? now : shEnd;
    const hourly = shiftHourly(s);
    const points = [];
    let cum = 0;
    let cumTarget = 0;
    let elapsedHrs = 0;
    const totalHrs = (shEnd - shStart) / 3600000;
    for (let t = new Date(startHour); t <= endIter; t.setHours(t.getHours() + 1)) {
      const key = hourKeyOf(t);
      cum += hourly[key] || 0;
      const hourTo = new Date(Math.min(t.getTime() + 3600000, endIter.getTime()));
      const breakMs = breakOverlapMs(s, new Date(t), hourTo);
      const productiveMs = Math.max(0, (hourTo - t) - breakMs);
      cumTarget += config.hourlyTarget * (productiveMs / 3600000);
      elapsedHrs = Math.min(totalHrs, Math.max(0, (hourTo - shStart) / 3600000));
      points.push({ x: elapsedHrs, val: cum, target: cumTarget });
    }
    if (!points.length) { ctx.fillStyle = getCss("--muted"); ctx.font = "13px system-ui"; ctx.fillText(tt("charts.noData"), 10, 30); return; }
    const padL = 44, padR = 14, padT = 14, padB = 22;
    const cw = w - padL - padR, ch = h - padT - padB;
    const maxY = Math.max(...points.map(p => Math.max(p.val, p.target)), 1);
    const maxX = totalHrs;
    ctx.strokeStyle = getCss("--border"); ctx.lineWidth = 1; ctx.font = "11px system-ui"; ctx.fillStyle = getCss("--muted");
    [0, 0.5, 1].forEach((p) => {
      const y = padT + ch * (1 - p);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke();
      ctx.fillText(Math.round(maxY * p).toLocaleString(), 4, y + 3);
    });
    // target line
    ctx.strokeStyle = getCss("--accent");
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padL + (p.x / maxX) * cw;
      const y = padT + ch * (1 - p.target / maxY);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    // actual line
    ctx.strokeStyle = getCss("--blue"); ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = padL + (p.x / maxX) * cw;
      const y = padT + ch * (1 - p.val / maxY);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // last point dot
    const last = points[points.length - 1];
    const lx = padL + (last.x / maxX) * cw;
    const ly = padT + ch * (1 - last.val / maxY);
    ctx.fillStyle = getCss("--blue");
    ctx.beginPath(); ctx.arc(lx, ly, 5, 0, Math.PI * 2); ctx.fill();
    // legend
    ctx.fillStyle = getCss("--muted"); ctx.fillText(tt("charts.legend"), padL, h - 4);
  }

  function drawScrapChart(cv, s) {
    if (!cv || !s) return;
    const { ctx, w, h } = fitCanvas(cv);
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const now = new Date();
    const startHour = new Date(shStart); startHour.setMinutes(0, 0, 0);
    const endIter = now < shEnd ? now : shEnd;
    const buckets = {};
    for (const c of s.captures || []) {
      if (c.undone || c.kind !== "scrap") continue;
      const t = new Date(c.ts);
      if (t < shStart || t >= shEnd) continue;
      buckets[hourKeyOf(t)] = (buckets[hourKeyOf(t)] || 0) + c.qty;
    }
    const bars = [];
    for (let t = new Date(startHour); t <= endIter; t.setHours(t.getHours() + 1)) {
      let lh = t.getHours(); const ap = lh >= 12 ? "pm" : "am"; lh = lh % 12; if (lh === 0) lh = 12;
      bars.push({ label: lh + ap, value: buckets[hourKeyOf(t)] || 0 });
    }
    const padL = 30, padR = 14, padT = 12, padB = 22;
    const cw = w - padL - padR, ch = h - padT - padB;
    const max = Math.max(1, ...bars.map(b => b.value));
    ctx.strokeStyle = getCss("--border"); ctx.lineWidth = 1; ctx.font = "11px system-ui"; ctx.fillStyle = getCss("--muted");
    [0, 1].forEach((p) => {
      const y = padT + ch * (1 - p);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke();
      ctx.fillText(Math.round(max * p), 4, y + 3);
    });
    const bw = cw / Math.max(1, bars.length);
    ctx.fillStyle = getCss("--red");
    bars.forEach((b, i) => {
      const bh = (b.value / max) * ch;
      ctx.fillRect(padL + i * bw + 2, padT + ch - bh, Math.max(2, bw - 4), bh);
    });
    ctx.fillStyle = getCss("--muted");
    const step = Math.max(1, Math.ceil(bars.length / 10));
    bars.forEach((b, i) => {
      if (i % step !== 0 && i !== bars.length - 1) return;
      const x = padL + i * bw + bw / 2;
      const tw = ctx.measureText(b.label).width;
      ctx.fillText(b.label, x - tw / 2, h - 6);
    });
  }

  function drawEmployeeChart(cv, s) {
    if (!cv || !s) return;
    const { ctx, w, h } = fitCanvas(cv);
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const byEmp = {};
    for (const c of s.captures || []) {
      if (c.undone || c.kind !== "good" || !c.employeeId) continue;
      const t = new Date(c.ts);
      if (t < shStart || t >= shEnd) continue;
      byEmp[c.employeeId] = (byEmp[c.employeeId] || 0) + c.qty;
    }
    const arr = Object.entries(byEmp).map(([emp, qty]) => ({ emp, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8);
    const padL = 60, padR = 14, padT = 10, padB = 16;
    const cw = w - padL - padR, ch = h - padT - padB;
    if (!arr.length) { ctx.fillStyle = getCss("--muted"); ctx.font = "13px system-ui"; ctx.fillText(tt("charts.noEmployees"), 10, 30); return; }
    const max = Math.max(...arr.map(a => a.qty), 1);
    const rowH = ch / arr.length;
    ctx.font = "12px system-ui";
    arr.forEach((row, i) => {
      const y = padT + i * rowH + 4;
      const bh = rowH - 8;
      const bw2 = (row.qty / max) * cw;
      ctx.fillStyle = getCss("--blue");
      ctx.fillRect(padL, y, bw2, bh);
      ctx.fillStyle = getCss("--text");
      ctx.fillText("Emp " + row.emp, 6, y + bh / 2 + 4);
      ctx.fillStyle = getCss("--muted");
      const valStr = row.qty.toLocaleString();
      ctx.fillText(valStr, padL + bw2 + 6, y + bh / 2 + 4);
    });
  }

  // Charts view can be scrubbed back in time via the weekstrip. When the
  // selected date is today, use the live current session; otherwise pick the
  // best matching session for that date (prefer same line+shift+operator as
  // this device, fall back to the most recently updated).
  let chartsViewDate = null; // ISO yyyy-mm-dd; null = today/live
  function pickSessionForChartsDate(iso) {
    if (!iso || iso === todayKey()) return getSession();
    const matches = loadSessions().filter((s) => s.date === iso);
    if (!matches.length) return null;
    const preferred = matches.find((s) =>
      s.lineId === device.lineId &&
      s.shiftId === (current && current.shiftId) &&
      s.operatorId === device.operatorId
    );
    if (preferred) return preferred;
    const sorted = matches.slice().sort((a, b) =>
      (b.updatedAt || b.startedAt || "").localeCompare(a.updatedAt || a.startedAt || "")
    );
    return sorted[0];
  }
  function renderChartsView() {
    const iso = chartsViewDate || todayKey();
    const s = pickSessionForChartsDate(iso);
    const empty = $("charts-empty");
    if (!s) {
      if (empty) empty.classList.remove("hidden");
      setText("kpi-oee", "—"); setText("kpi-avail", "—");
      setText("kpi-perf", "—"); setText("kpi-qual", "—");
      const cvs = ["chart-hourly", "chart-cumulative", "chart-scrap"];
      for (const id of cvs) {
        const cv = $(id);
        if (cv) { const c = cv.getContext("2d"); c && c.clearRect(0, 0, cv.width, cv.height); }
      }
      renderHeatmap();
      const d2 = $("date-label-2");
      if (d2) d2.textContent = fmtDate(new Date(iso + "T00:00:00"));
      return;
    }
    if (empty) empty.classList.add("hidden");
    const oeeStats = computeOEEBreakdown(s);
    setText("kpi-oee", oeeStats.oee + "%");
    setText("kpi-avail", oeeStats.availability + "%");
    setText("kpi-perf", oeeStats.performance + "%");
    setText("kpi-qual", oeeStats.quality + "%");
    drawShiftChart($("chart-hourly"), s);
    drawCumulativeChart($("chart-cumulative"), s);
    drawScrapChart($("chart-scrap"), s);
    renderHeatmap();
    const d = $("date-label-2");
    if (d) d.textContent = fmtDate(new Date(iso + "T00:00:00"));
  }

  function computeOEEBreakdown(s) {
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const now = new Date();
    const endCap = now < shEnd ? now : shEnd;
    if (endCap <= shStart) return { oee: 0, availability: 0, performance: 0, quality: 100 };
    const plannedMs = endCap - shStart;
    const downMs = (s.downtime || []).reduce((acc, d) => {
      const ds = new Date(d.start);
      const de = d.end ? new Date(d.end) : now;
      const cs = ds > shStart ? ds : shStart;
      const ce = de < endCap ? de : endCap;
      return acc + Math.max(0, ce - cs);
    }, 0);
    const availability = Math.max(0, (plannedMs - downMs) / plannedMs);
    const runHours = Math.max(1 / 3600, (plannedMs - downMs) / 3600000);
    const expected = config.hourlyTarget * runHours;
    const totals = shiftTotals(s);
    const performance = expected > 0 ? Math.min(1, (totals.good + totals.scrap) / expected) : 0;
    const total = totals.good + totals.scrap;
    const quality = total > 0 ? totals.good / total : 1;
    return {
      oee: Math.round(availability * performance * quality * 100),
      availability: Math.round(availability * 100),
      performance: Math.round(performance * 100),
      quality: Math.round(quality * 100),
    };
  }

  function drawShiftChart(cv, s) {
    if (!cv || !s) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    cv.width = rect.width * dpr;
    cv.height = rect.height * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const buckets = [];
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const now = new Date();
    const startHour = new Date(shStart); startHour.setMinutes(0, 0, 0);
    const currentHourStart = new Date(now); currentHourStart.setMinutes(0, 0, 0);
    const endIter = currentHourStart < shEnd ? currentHourStart : shEnd;
    const currentKey = hourKeyOf(currentHourStart);
    const hourly = shiftHourly(s);
    for (let t = new Date(startHour); t <= endIter; t.setHours(t.getHours() + 1)) {
      if (t.getTime() + 3600000 <= shStart.getTime()) continue;
      const key = hourKeyOf(t);
      const val = hourly[key] || 0;
      let lh = t.getHours();
      const lap = lh >= 12 ? "pm" : "am";
      lh = lh % 12; if (lh === 0) lh = 12;
      const effTarget = effectiveHourTarget(s, new Date(t));
      const breakMs = breakOverlapMs(s, new Date(t), new Date(t.getTime() + 3600000));
      buckets.push({ label: lh + lap, value: val, isCurrent: key === currentKey, effTarget, hasBreak: breakMs > 0, hourStart: new Date(t) });
    }
    if (!buckets.length) buckets.push({ label: "—", value: 0, effTarget: target, hasBreak: false });
    const target = config.hourlyTarget;
    const max = Math.max(target, ...buckets.map((b) => b.value), 1);

    const padL = 36, padR = 12, padT = 14, padB = 22;
    const cw = w - padL - padR;
    const ch = h - padT - padB;
    const bw = cw / buckets.length;

    // grid
    const text = getCss("--muted") || "#5c6678";
    const border = getCss("--border") || "#d8dee9";
    ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = text;
    [0, 0.5, 1].forEach((p) => {
      const y = padT + ch * (1 - p);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + cw, y); ctx.stroke();
      ctx.fillText(Math.round(max * p), 4, y + 3);
    });

    // target line
    const targetY = padT + ch * (1 - target / max);
    ctx.strokeStyle = getCss("--accent") || "#e07a2b";
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(padL, targetY); ctx.lineTo(padL + cw, targetY); ctx.stroke();
    ctx.setLineDash([]);

    // bars
    const cGreen = getCss("--green") || "#1aa05a";
    const cAccent = getCss("--accent") || "#e07a2b";
    const cRed = getCss("--red") || "#d23b4d";
    const cBlue = getCss("--blue") || "#1f7ee0";
    function barColorFor(b) {
      const t = b.effTarget != null ? b.effTarget : target;
      if (t <= 0) return cBlue;
      if (b.value >= t) return cGreen;
      return b.isCurrent ? cAccent : cRed;
    }
    buckets.forEach((b, i) => {
      const x = padL + i * bw + 2;
      const bwInner = Math.max(2, bw - 4);
      // shade break hours
      if (b.hasBreak) {
        ctx.fillStyle = "rgba(150,150,150,0.12)";
        ctx.fillRect(x, padT, bwInner, ch);
      }
      const bh = (b.value / max) * ch;
      const y = padT + ch - bh;
      ctx.fillStyle = barColorFor(b);
      ctx.fillRect(x, y, bwInner, bh);
    });

    // x labels (skip if cramped)
    ctx.fillStyle = text;
    const step = Math.max(1, Math.ceil(buckets.length / 10));
    buckets.forEach((b, i) => {
      if (i % step !== 0 && i !== buckets.length - 1) return;
      const x = padL + i * bw + bw / 2;
      const tw = ctx.measureText(b.label).width;
      ctx.fillText(b.label, x - tw / 2, h - 6);
    });
  }

  function getCss(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---- Schedule / alerts ----
  function renderSchedule() {
    const scheduleListEl = $("schedule-list");
    if (!scheduleListEl) return;
    scheduleListEl.innerHTML = "";
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const times = activeAlertTimes();
    times.forEach((t, idx) => {
      const [hh, mm] = t.split(":").map(Number);
      const mins = hh * 60 + mm;
      const passed = mins < nowMin;
      const li = document.createElement("li");
      if (passed) li.classList.add("done");
      const label = idx === 0 ? tt("sched.first")
        : idx === times.length - 1 ? tt("sched.last")
        : tt("sched.regular");
      li.innerHTML = `<span class="sched-time">${fmt12FromHHMM(t)}</span><span class="sched-tag">${escapeHtml(tt("sched.tag"))}</span><span>${escapeHtml(label)}</span>`;
      scheduleListEl.appendChild(li);
    });
  }

  function updateNextAlert() {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const upcoming = activeAlertTimes()
      .map((t) => { const [h, m] = t.split(":").map(Number); return { time: t, mins: h * 60 + m }; })
      .filter((a) => a.mins > nowMin)
      .sort((a, b) => a.mins - b.mins);
    const el = $("next-alert-time");
    if (el) el.textContent = upcoming.length ? fmt12FromHHMM(upcoming[0].time) : "—";
    const cd = $("next-alert-countdown");
    const capBtn = $("btn-capture");
    if (upcoming.length) {
      const minsToNext = upcoming[0].mins - nowMin;
      if (cd) cd.textContent = tt("sched.in", { n: minsToNext });
      if (capBtn) capBtn.classList.toggle("pulse", minsToNext <= 5);
    } else {
      if (cd) cd.textContent = "—";
      if (capBtn) capBtn.classList.remove("pulse");
    }
  }

  function tick() {
    const now = new Date();
    $("clock").textContent = fmtTimeFull(now);
    const dateEl = $("date-label");
    if (dateEl) dateEl.textContent = fmtDate(now);
    const changed = ensureAutoSession();
    if (changed) renderAll();
    updateHourRing(getSession());
    if (!isShiftActive()) return;

    const popupOpen = !$("alert-overlay").classList.contains("hidden") || !$("form-overlay").classList.contains("hidden");
    if (popupOpen) return;
    if (Date.now() < snoozeUntil) return;

    const hhmm = fmtTime(now);
    if (activeAlertTimes().indexOf(hhmm) === -1) return;
    const key = todayKey() + " " + hhmm;
    if (lastFired[key]) return;
    if (now.getSeconds() <= 10) {
      lastFired[key] = true;
      save(STORAGE.LAST_FIRED, lastFired);
      showAlert(hhmm);
      renderSchedule();
      updateNextAlert();
    }
  }

  function updateSnoozeButton() {
    const btn = $("btn-snooze");
    if (btn) btn.textContent = tt("btn.snooze", { n: config.snoozeMinutes });
  }

  function showAlert(hhmm) {
    activeAlertTime = hhmm;
    $("alert-time").textContent = fmt12FromHHMM(hhmm);
    updateSnoozeButton();
    $("alert-overlay").classList.remove("hidden");
    $("alert-overlay").setAttribute("aria-hidden", "false");
    playBeep();
    buzz([200, 100, 200, 100, 200]);
    logEvent("alert", tt("log.alertFired", { time: fmt12FromHHMM(hhmm) }));
  }

  function hideAlert() {
    $("alert-overlay").classList.add("hidden");
    $("alert-overlay").setAttribute("aria-hidden", "true");
  }

  function showForm() {
    $("form-time").textContent = activeAlertTime ? fmt12FromHHMM(activeAlertTime) : fmt12(new Date());
    $("f-count").value = "";
    $("f-scrap").value = "";
    const last = getLastUserCapture(getSession());
    $("f-operator").value = last ? last.employeeId : "";
    selectedNotes = [];
    renderNoteChips();
    populateHoraSelect();
    $("form-overlay").classList.remove("hidden");
    $("form-overlay").setAttribute("aria-hidden", "false");
    setTimeout(() => {
      if (last) $("f-count").focus();
      else $("f-operator").focus();
    }, 50);
  }

  function populateHoraSelect() {
    const sel = $("f-forhour");
    if (!sel) return;
    const s = getSession();
    if (!s) { sel.innerHTML = ""; return; }
    const { start: shStart, end: shEnd } = getShiftWindow(s);
    const now = new Date();
    const defaultForHour = computeForHour(now.toISOString());
    const filled = shiftHourly(s);
    const startHour = new Date(shStart); startHour.setMinutes(0, 0, 0);
    const endIter = (now < shEnd ? now : shEnd);
    const opts = [];
    for (let t = new Date(startHour); t < shEnd; t.setHours(t.getHours() + 1)) {
      if (t.getTime() + 3600000 <= shStart.getTime()) continue;
      if (t > endIter) break;
      const key = hourKeyOf(t);
      let lh = t.getHours();
      const ap = lh >= 12 ? "PM" : "AM";
      const lh12 = lh % 12 || 12;
      let lh2 = (t.getHours() + 1) % 24;
      const ap2 = lh2 >= 12 ? "PM" : "AM";
      const lh212 = lh2 % 12 || 12;
      const label = filled[key]
        ? tt("form.hourOptCaptured", { h1: lh12, ap1: ap, h2: lh212, ap2: ap2, n: filled[key] })
        : tt("form.hourOpt", { h1: lh12, ap1: ap, h2: lh212, ap2: ap2 });
      const isDefault = key === defaultForHour;
      opts.push(`<option value="${key}"${isDefault ? " selected" : ""}>${escapeHtml(label)}</option>`);
    }
    sel.innerHTML = opts.join("") || '<option value="">' + escapeHtml(tt("form.noHours")) + '</option>';
  }

  function hideForm(force) {
    const hasValues = !force && (($("f-count") && $("f-count").value) || ($("f-scrap") && $("f-scrap").value) || ($("f-operator") && $("f-operator").value) || (selectedNotes && selectedNotes.length));
    if (hasValues) {
      if (!confirm(tt("form.confirmCancel"))) return;
    }
    $("form-overlay").classList.add("hidden");
    $("form-overlay").setAttribute("aria-hidden", "true");
  }

  // ---- Audio ----
  let audioCtx = null;
  function playBeep() {
    if (!config.audioEnabled) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx;
      const now = ctx.currentTime;
      [0, 0.35, 0.7].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 880; osc.type = "square"; gain.gain.value = 0;
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(config.audioVolume, now + offset + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset); osc.stop(now + offset + 0.25);
      });
    } catch (_) {}
  }

  // ---- Toast ----
  let toastTimer = null;
  function toast(msg, opts) {
    const el = $("toast");
    if (!el) return;
    el.className = "toast" + (opts && opts.error ? " error" : "");
    el.textContent = msg;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), opts && opts.duration ? opts.duration : 3000);
  }

  // ---- Vibration ----
  function buzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern || 200); } catch (_) {}
  }

  // ---- Last capture state ----
  function getLastUserCapture(s) {
    if (!s || !s.captures || !s.captures.length) return null;
    for (let i = s.captures.length - 1; i >= 0; i--) {
      const c = s.captures[i];
      if (!c.undone && c.employeeId) return c;
    }
    return null;
  }

  // ---- Numeric keypad ----
  let numpadTarget = null;
  let numpadBuffer = "";

  function openNumpad(input) {
    if (!input) return;
    numpadTarget = input;
    numpadBuffer = (input.value || "").replace(/[^0-9]/g, "");
    const label = (input.previousElementSibling && input.previousElementSibling.textContent) || tt("numpad.enterQty");
    const title = $("numpad-title");
    if (title) title.textContent = label;
    // Show quick chips only for quantity fields (f-count, f-scrap)
    const quick = $("numpad-quick");
    const isQty = input.id === "f-count" || input.id === "f-scrap";
    if (quick) quick.classList.toggle("hidden", !isQty);
    renderNumpad();
    const ov = $("numpad-overlay");
    if (!ov) return;
    ov.classList.remove("hidden");
    ov.setAttribute("aria-hidden", "false");
  }

  function closeNumpad(commit) {
    const ov = $("numpad-overlay");
    if (!ov) return;
    if (commit && numpadTarget) {
      numpadTarget.value = numpadBuffer;
      numpadTarget.dispatchEvent(new Event("input", { bubbles: true }));
    }
    ov.classList.add("hidden");
    ov.setAttribute("aria-hidden", "true");
    numpadTarget = null;
    numpadBuffer = "";
  }

  function renderNumpad() {
    const disp = $("numpad-display");
    if (disp) disp.textContent = numpadBuffer === "" ? "0" : numpadBuffer;
  }

  function numpadPress(key) {
    if (key === "clear") numpadBuffer = "";
    else if (key === "back") numpadBuffer = numpadBuffer.slice(0, -1);
    else if (/^[0-9]$/.test(key)) {
      if (numpadBuffer.length >= 9) return;
      if (numpadBuffer === "0") numpadBuffer = key;
      else numpadBuffer += key;
    }
    renderNumpad();
  }

  function wireNumpad() {
    document.querySelectorAll(".numpad-input").forEach((inp) => {
      const open = (e) => { e.preventDefault(); inp.blur(); openNumpad(inp); };
      inp.addEventListener("click", open);
      inp.addEventListener("focus", open);
    });
    document.querySelectorAll("#numpad-overlay .numkey").forEach((btn) => {
      btn.addEventListener("click", () => numpadPress(btn.dataset.key));
    });
    document.querySelectorAll("#numpad-overlay .quickkey").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.set != null) numpadBuffer = btn.dataset.set;
        else if (btn.dataset.add != null) {
          const cur = parseInt(numpadBuffer || "0", 10) || 0;
          numpadBuffer = String(cur + parseInt(btn.dataset.add, 10));
        }
        renderNumpad();
      });
    });
    const ok = $("btn-numpad-ok");
    const cancel = $("btn-numpad-cancel");
    if (ok) ok.addEventListener("click", () => closeNumpad(true));
    if (cancel) cancel.addEventListener("click", () => closeNumpad(false));
  }

  // ---- Notes chips ----
  let selectedNotes = [];

  function renderNoteChips() {
    const container = $("f-notes");
    if (!container) return;
    container.innerHTML = "";
    NOTE_KEYS.forEach((key) => {
      const label = tt(key);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-chip" + (selectedNotes.indexOf(key) !== -1 ? " active" : "");
      btn.textContent = label;
      btn.addEventListener("click", () => {
        const i = selectedNotes.indexOf(key);
        if (i === -1) selectedNotes.push(key);
        else selectedNotes.splice(i, 1);
        renderNoteChips();
      });
      container.appendChild(btn);
    });
  }

  // ---- Captures (good + scrap) with undo ----
  function addCapture(qty, kind) {
    const sess = getSession();
    if (!sess) return;
    const now = new Date();
    if (!isWithinShift(now, sess)) {
      const { start, end } = getShiftWindow(sess);
      const msg = tt("form.outOfShift", { start: fmt12(start), end: fmt12(end) });
      if (!confirm(msg)) return;
    }
    const id = "c" + Date.now() + Math.random().toString(36).slice(2, 6);
    const ts = now.toISOString();
    updateSession((s) => {
      s.captures.push({ id, ts, qty, kind });
    });
    const fresh = getSession();
    const totals = shiftTotals(fresh);
    if (kind === "scrap") {
      logEvent("scrap", tt("log.scrapMsg", { qty, total: totals.scrap.toLocaleString() }), { captureId: id });
    } else {
      logEvent("capture", tt("log.captureMsg", { qty, total: totals.good.toLocaleString() }), { captureId: id });
    }
    if (window.sync && window.sync.pushCapture) {
      window.sync.pushCapture({ id, ts, qty, kind }, current);
    }
    renderAll();
  }

  function undoLastCapture() {
    const s = getSession();
    if (!s || !s.captures.length) return;
    const last = s.captures[s.captures.length - 1];
    if (last.undone) return;
    if (Date.now() - new Date(last.ts).getTime() > UNDO_WINDOW_MS) return;
    updateSession((s2) => { s2.captures[s2.captures.length - 1].undone = true; });
    logEvent("undo", tt(last.kind === "scrap" ? "log.undoMsgScrap" : "log.undoMsgPieces", { qty: last.qty }));
    if (window.sync && window.sync.pushCaptureUndone) window.sync.pushCaptureUndone(last.id);
    renderAll();
  }

  function updateUndoButton(s) {
    const btn = $("btn-undo");
    if (!btn) return;
    if (!s) { btn.classList.add("hidden"); return; }
    const last = s.captures[s.captures.length - 1];
    if (!last || last.undone) { btn.classList.add("hidden"); return; }
    const age = Date.now() - new Date(last.ts).getTime();
    if (age < 0 || age > UNDO_WINDOW_MS) { btn.classList.add("hidden"); return; }
    btn.classList.remove("hidden");
    const remain = Math.ceil((UNDO_WINDOW_MS - age) / 1000);
    btn.textContent = tt("btn.undoCountdown", { s: remain });
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => updateUndoButton(getSession()), 1000);
  }

  // ---- Status / downtime ----
  function changeStatus(newStatus) {
    const s = getSession();
    if (!s || s.currentStatus === newStatus) return;
    const nowIso = new Date().toISOString();
    updateSession((s2) => {
      if (s2.currentStatus !== "Running") {
        const last = s2.downtime[s2.downtime.length - 1];
        if (last && !last.end) {
          last.end = nowIso;
          last.durationMs = new Date(last.end) - new Date(last.start);
        }
      }
      if (newStatus !== "Running") {
        s2.downtime.push({ start: nowIso, end: null, status: newStatus });
      }
      s2.currentStatus = newStatus;
    });
    const fresh = getSession();
    const lastDt = fresh.downtime[fresh.downtime.length - 1];
    logEvent("status", tt("log.statusChanged", { status: statusLabel(newStatus) }));
    if (newStatus !== "Running") {
      logEvent("downtime", tt("log.downStarted", { status: statusLabel(newStatus) }));
    } else {
      if (lastDt && lastDt.durationMs) {
        const mins = Math.round(lastDt.durationMs / 60000);
        logEvent("downtime", tt("log.downEnded", { status: statusLabel(lastDt.status), mins }));
        if (window.sync && window.sync.pushDowntime) window.sync.pushDowntime(lastDt, current);
      }
    }
    renderAll();
  }

  // ---- Submissions ----
  function submitForm(e) {
    e.preventDefault();
    const s = getSession();
    if (!s) { hideForm(); return; }
    const employeeId = ($("f-operator").value || "").trim();
    const qty = Number($("f-count").value);
    const scrap = Number($("f-scrap").value) || 0;
    if (!employeeId) { $("f-operator").focus(); return; }
    if (!Number.isFinite(qty) || qty <= 0) { $("f-count").focus(); return; }
    if (!Number.isFinite(scrap) || scrap < 0) { $("f-scrap").focus(); return; }
    const notes = selectedNotes.slice();
    const now = new Date();
    const ts = now.toISOString();
    if (!isWithinShift(now, s)) {
      if (!confirm(tt("form.outOfShiftSimple"))) return;
    }
    const goodId = "c" + Date.now() + "g" + Math.random().toString(36).slice(2, 5);
    const scrapId = "c" + Date.now() + "s" + Math.random().toString(36).slice(2, 5);
    const forHour = ($("f-forhour") && $("f-forhour").value) || computeForHour(ts);
    updateSession((s2) => {
      s2.captures.push({ id: goodId, ts, qty, kind: "good", employeeId, notes, forHour });
      if (scrap > 0) s2.captures.push({ id: scrapId, ts, qty: scrap, kind: "scrap", employeeId, notes, forHour });
      s2.submissions.push({
        timestamp: ts, alertTime: activeAlertTime, shiftId: s.shiftId, lineId: s.lineId,
        employeeId, productionCount: qty, scrapCount: scrap, notes, forHour,
      });
    });
    if (window.sync && window.sync.pushCapture) {
      window.sync.pushCapture({ id: goodId, ts, qty, kind: "good", employeeId, notes, forHour }, current);
      if (scrap > 0) window.sync.pushCapture({ id: scrapId, ts, qty: scrap, kind: "scrap", employeeId, notes, forHour }, current);
    }
    const noteLabels = notes.map((n) => /^notes\./.test(n) ? tt(n) : n);
    const noteStr = noteLabels.length ? tt("log.captureNotePart", { notes: noteLabels.join(", ") }) : "";
    const scrapStr = scrap ? tt("log.captureScrapPart", { n: scrap }) : "";
    logEvent("capture", tt("log.captureFull", { emp: employeeId, qty, scrap: scrapStr, notes: noteStr }));
    activeAlertTime = null;
    hideForm(true);
    renderAll();
    const cv = $("view-charts");
    if (cv && !cv.hidden) renderChartsView();
    toast(tt("toast.registered", { qty, emp: employeeId }));
    buzz(80);
  }

  function flushPending() {
    if (!navigator.onLine) return;
    const pending = load(STORAGE.PENDING, []);
    if (!pending.length) return;
    save(STORAGE.PENDING, []);
    logEvent("system", tt("log.flushed", { n: pending.length }));
  }

  // ---- History ----
  function openHistory() {
    const today = todayKey();
    $("history-date").value = today;
    renderHistory(today);
    $("history-overlay").classList.remove("hidden");
    $("history-overlay").setAttribute("aria-hidden", "false");
  }

  function closeHistory() {
    $("history-overlay").classList.add("hidden");
    $("history-overlay").setAttribute("aria-hidden", "true");
  }

  function renderHistory(date) {
    const listEl = $("history-list");
    if (!listEl) return;
    const all = loadSessions().filter((s) => s.date === date);
    if (!all.length) {
      listEl.innerHTML = '<p class="muted">' + escapeHtml(tt("history.empty")) + '</p>';
      return;
    }
    listEl.innerHTML = all.map((s, idx) => {
      const oee = computeOEE(s);
      const totals = shiftTotals(s);
      const downMin = Math.round((s.downtime || []).reduce((a, d) => a + ((d.end ? new Date(d.end) : new Date()) - new Date(d.start)), 0) / 60000);
      return `
        <div class="history-item">
          <div class="hi-head">
            <strong>${escapeHtml(lineLabel(s.lineId))} · ${escapeHtml(shiftLabel(s.shiftId))}</strong>
            <span class="muted">${escapeHtml(operatorName(s.operatorId))}</span>
          </div>
          <div class="hi-stats">
            <span>${escapeHtml(tt("history.production"))}: <strong>${totals.good.toLocaleString()}</strong></span>
            <span>${escapeHtml(tt("history.scrap"))}: <strong>${totals.scrap.toLocaleString()}</strong></span>
            <span>${escapeHtml(tt("history.oee"))}: <strong>${oee}%</strong></span>
            <span>${escapeHtml(tt("history.down"))}: <strong>${escapeHtml(tt("history.min", { n: downMin }))}</strong></span>
            <span>${escapeHtml(tt("history.submissions"))}: <strong>${(s.submissions || []).length}</strong></span>
          </div>
          <canvas class="hist-chart" data-idx="${idx}" width="600" height="140"></canvas>
        </div>
      `;
    }).join("");
    // draw charts
    all.forEach((s, idx) => {
      const cv = listEl.querySelector('canvas.hist-chart[data-idx="' + idx + '"]');
      if (cv) drawShiftChart(cv, s);
    });
  }

  function exportCSV(date) {
    const all = loadSessions().filter((s) => s.date === date);
    const headers = ["fecha", "linea", "turno", "operador", "inicio", "fin", "produccion", "rechazos", "oee", "paro_min", "envios"];
    const rows = all.map((s) => {
      const oee = computeOEE(s);
      const totals = shiftTotals(s);
      const downMin = Math.round((s.downtime || []).reduce((a, d) => a + ((d.end ? new Date(d.end) : new Date()) - new Date(d.start)), 0) / 60000);
      return [
        s.date, lineLabel(s.lineId), shiftLabel(s.shiftId), operatorName(s.operatorId),
        s.startedAt, s.endedAt || "",
        totals.good, totals.scrap, oee + "%", downMin, (s.submissions || []).length,
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => {
      const str = String(v).replace(/"/g, '""');
      return /[,"\n]/.test(str) ? '"' + str + '"' : str;
    }).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "produccion-" + date + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    logEvent("system", tt("log.exportedCSV", { date }));
  }

  function exportAllCSV() {
    const all = loadSessions().slice().sort((a, b) => a.date.localeCompare(b.date));
    const headers = ["fecha", "linea", "turno", "operador", "inicio", "fin", "produccion", "rechazos", "oee", "paro_min", "envios"];
    const rows = all.map((s) => {
      const oee = computeOEE(s);
      const totals = shiftTotals(s);
      const downMin = Math.round((s.downtime || []).reduce((a, d) => a + ((d.end ? new Date(d.end) : new Date()) - new Date(d.start)), 0) / 60000);
      return [s.date, lineLabel(s.lineId), shiftLabel(s.shiftId), operatorName(s.operatorId), s.startedAt, s.endedAt || "", totals.good, totals.scrap, oee + "%", downMin, (s.submissions || []).length];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => {
      const str = String(v).replace(/"/g, '""');
      return /[,"\n]/.test(str) ? '"' + str + '"' : str;
    }).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "produccion-todos.csv";
    a.click();
    URL.revokeObjectURL(url);
    logEvent("system", tt("log.exportedAllCSV", { n: all.length }));
  }

  // ---- Wiring ----
  function wire() {
    $("btn-capture").addEventListener("click", showForm);

    // Admin link gate (modal)
    const ADMIN_PWD_KEY = "prod.admin.password.v1";
    const ADMIN_UNLOCK_KEY = "prod.admin.unlocked.v1";
    const getAdminPwd = () => { try { return JSON.parse(localStorage.getItem(ADMIN_PWD_KEY)) || "1234"; } catch (_) { return "1234"; } };
    const adminLink = $("admin-link");
    const gate = $("admin-gate-overlay");
    const gateForm = $("admin-gate-form");
    const gatePwd = $("admin-gate-pwd");
    const gateErr = $("admin-gate-error");
    const gateCancel = $("btn-admin-gate-cancel");
    function openGate() {
      if (!gate) return;
      gatePwd.value = "";
      gateErr.classList.add("hidden");
      gate.classList.remove("hidden");
      gate.setAttribute("aria-hidden", "false");
      setTimeout(() => gatePwd.focus(), 50);
    }
    function closeGate() {
      if (!gate) return;
      gate.classList.add("hidden");
      gate.setAttribute("aria-hidden", "true");
    }
    if (adminLink) adminLink.addEventListener("click", (e) => {
      if (sessionStorage.getItem(ADMIN_UNLOCK_KEY) === "1") return;
      e.preventDefault();
      openGate();
    });
    if (gateCancel) gateCancel.addEventListener("click", closeGate);
    if (gateForm) gateForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (gatePwd.value === getAdminPwd()) {
        sessionStorage.setItem(ADMIN_UNLOCK_KEY, "1");
        closeGate();
        window.location.href = "admin.html";
      } else {
        gateErr.classList.remove("hidden");
        gatePwd.value = "";
        gatePwd.focus();
      }
    });
    $("btn-undo").addEventListener("click", undoLastCapture);
    const _bn = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
    _bn("btn-form-cancel", () => hideForm(false));

    // Scanner Enter: advance focus instead of submit
    const fOp = $("f-operator");
    if (fOp) fOp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); $("f-count").focus(); }
    });
    const fCount = $("f-count");
    if (fCount) fCount.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); $("f-scrap").focus(); }
    });

    const eqs = $("equip-status");
    if (eqs) eqs.addEventListener("change", (e) => changeStatus(e.target.value));

    const _on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    _on("btn-log-clear", "click", () => { if (confirm(tt("log.confirmClear"))) clearLog(); });
    _on("log-search", "input", (e) => { logFilterText = e.target.value.toLowerCase().trim(); renderLog(); });
    document.querySelectorAll(".log-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".log-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        logFilterType = chip.dataset.type;
        renderLog();
      });
    });

    const scheduleToggle = $("schedule-toggle");
    const scheduleSection = $("schedule-section");
    if (scheduleToggle && scheduleSection) {
      const initial = load("prod.ui.scheduleCollapsed", false);
      scheduleSection.dataset.collapsed = String(initial);
      scheduleToggle.setAttribute("aria-expanded", String(!initial));
      scheduleToggle.addEventListener("click", () => {
        const next = scheduleSection.dataset.collapsed !== "true";
        scheduleSection.dataset.collapsed = String(next);
        scheduleToggle.setAttribute("aria-expanded", String(!next));
        save("prod.ui.scheduleCollapsed", next);
      });
    }

    function wireCollapse(toggleId, sectionId, storageKey, defaultCollapsed, onExpand) {
      const tog = $(toggleId);
      const sec = $(sectionId);
      if (!tog || !sec) return;
      const initial = load(storageKey, defaultCollapsed);
      sec.dataset.collapsed = String(initial);
      tog.setAttribute("aria-expanded", String(!initial));
      tog.addEventListener("click", () => {
        const next = sec.dataset.collapsed !== "true";
        sec.dataset.collapsed = String(next);
        tog.setAttribute("aria-expanded", String(!next));
        save(storageKey, next);
        if (!next && typeof onExpand === "function") onExpand();
      });
    }
    wireCollapse("log-toggle", "log-section", "prod.ui.logCollapsed", true, renderLog);
    wireCollapse("chart-toggle", "chart-section", "prod.ui.chartCollapsed", false, () => {
      const s = getSession();
      if (s) renderChart(s);
    });

    // Charts-view weekstrip (lets the user scrub past dates). Initialized
    // lazily on first switch to the charts view, since its container starts
    // hidden and Intl rendering needs the DOM laid out.
    let chartsWeekStripReady = false;
    function ensureChartsWeekStrip() {
      if (chartsWeekStripReady) return;
      if (!$("charts-weekstrip")) return;
      chartsWeekStripReady = true;
      initWeekStrip("charts-weekstrip", chartsViewDate || todayKey(), (iso) => {
        chartsViewDate = iso;
        renderChartsView();
      });
    }

    // Sidebar nav
    function switchView(view) {
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
      const cap = $("view-capture");
      const ch = $("view-charts");
      if (cap) cap.hidden = view !== "capture";
      if (ch) ch.hidden = view !== "charts";
      save("prod.ui.view", view);
      if (view === "charts") { ensureChartsWeekStrip(); renderChartsView(); }
      if (view === "capture") {
        renderAll();
      }
    }
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
    const initialView = load("prod.ui.view", "capture");
    switchView(initialView);

    _on("btn-history", "click", openHistory);
    _on("btn-history-close", "click", closeHistory);
    _on("history-date", "change", (e) => renderHistory(e.target.value));
    _on("btn-history-export", "click", () => exportCSV($("history-date").value));

    document.addEventListener("keydown", (e) => {
      const target = e.target;
      const inField = target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");
      if (inField) return;
      const formOpen = !$("form-overlay").classList.contains("hidden");
      const alertOpen = !$("alert-overlay").classList.contains("hidden");
      if (formOpen) {
        if (e.key === "Escape") { e.preventDefault(); hideForm(); }
        return;
      }
      if (alertOpen) return;
      if (e.code === "Space") { e.preventDefault(); showForm(); }
    });

    $("btn-register").addEventListener("click", () => { hideAlert(); showForm(); });
    $("btn-snooze").addEventListener("click", () => {
      snoozeUntil = Date.now() + config.snoozeMinutes * 60 * 1000;
      save(STORAGE.SNOOZE, snoozeUntil);
      hideAlert();
      logEvent("snooze", tt("log.snoozed", { n: config.snoozeMinutes }));
    });
    $("entry-form").addEventListener("submit", submitForm);

    window.addEventListener("online", flushPending);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE.CONFIG) {
        config = Object.assign({}, DEFAULT_CONFIG, load(STORAGE.CONFIG, {}));
        ensureAutoSession();
        renderAll();
      } else if (e.key === STORAGE.LINES) { lines = load(STORAGE.LINES, DEFAULT_LINES); ensureAutoSession(); renderAll(); }
      else if (e.key === STORAGE.SHIFTS) { shifts = load(STORAGE.SHIFTS, DEFAULT_SHIFTS); ensureAutoSession(); renderAll(); }
      else if (e.key === STORAGE.OPERATORS) { operators = load(STORAGE.OPERATORS, DEFAULT_OPERATORS); ensureAutoSession(); renderAll(); }
      else if (e.key === STORAGE.DEVICE) { device = load(STORAGE.DEVICE, device); ensureAutoSession(); renderAll(); }
      else if (e.key === STORAGE.LOG) { renderLog(); }
    });
  }

  // ---- PWA ----
  function registerSW() {
    // Disabled during dev to avoid stale caches. Re-enable for production.
    return;
  }

  // ---- Weekstrip date picker (admin history + charts view) ----
  function initWeekStrip(prefix, initialIso, onSelect) {
    // Back-compat: old call signature was initWeekStrip(initialIso, onSelect).
    if (typeof prefix === "string" && typeof initialIso === "function" && onSelect === undefined) {
      onSelect = initialIso; initialIso = prefix; prefix = "weekstrip";
    }
    if (!prefix) prefix = "weekstrip";
    const container = $(prefix);
    const monthBtn = $(prefix + "-month");
    const todayBtn = $(prefix + "-today");
    const prevBtn  = $(prefix + "-prev");
    const nextBtn  = $(prefix + "-next");
    const dowsEl   = $(prefix + "-dows");
    const daysEl   = $(prefix + "-days");
    if (!container || !monthBtn || !daysEl || !dowsEl) return null;

    let weekStart;
    let selectedIso = initialIso || todayKey();

    function isoToDate(iso) {
      const [Y, M, D] = iso.split("-").map(Number);
      return new Date(Y, M - 1, D, 0, 0, 0, 0);
    }
    function dateToIso(d) {
      return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    }
    function sundayOf(d) {
      const r = new Date(d); r.setHours(0, 0, 0, 0);
      r.setDate(r.getDate() - r.getDay());
      return r;
    }
    function capFirst(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function renderDows() {
      const locale = getLocale();
      const fmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
      const ref = sundayOf(new Date());
      dowsEl.innerHTML = "";
      for (let i = 0; i < 7; i++) {
        const d = new Date(ref); d.setDate(ref.getDate() + i);
        const span = document.createElement("span");
        span.textContent = capFirst(fmt.format(d).replace(/\.$/, ""));
        dowsEl.appendChild(span);
      }
    }

    function render() {
      const sel = isoToDate(selectedIso);
      const ws = new Date(weekStart);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      const monthRef = (sel >= ws && sel <= we) ? sel : new Date(ws.getTime() + 3 * 86400000);
      const locale = getLocale();
      const monthFmt = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
      monthBtn.textContent = capFirst(monthFmt.format(monthRef));

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayIso = dateToIso(today);

      daysEl.innerHTML = "";
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart); d.setDate(weekStart.getDate() + i);
        const iso = dateToIso(d);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "weekstrip-day";
        if (iso === selectedIso) btn.classList.add("is-selected");
        if (iso === todayIso)    btn.classList.add("is-today");
        if (d > today)           btn.classList.add("is-future");
        btn.textContent = String(d.getDate());
        btn.setAttribute("aria-label", d.toLocaleDateString(locale, {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        }));
        if (iso === selectedIso) btn.setAttribute("aria-selected", "true");
        const isoCaptured = iso;
        btn.addEventListener("click", () => {
          if (btn.classList.contains("is-future")) return;
          selectInternal(isoCaptured);
        });
        daysEl.appendChild(btn);
      }
    }

    function selectInternal(iso) {
      selectedIso = iso;
      const sel = isoToDate(iso);
      const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
      if (sel < weekStart || sel >= weekEnd) weekStart = sundayOf(sel);
      render();
      if (typeof onSelect === "function") onSelect(iso);
    }
    function next() { weekStart = new Date(weekStart.getTime() + 7 * 86400000); render(); }
    function prev() { weekStart = new Date(weekStart.getTime() - 7 * 86400000); render(); }
    function jumpToday() {
      const t = new Date(); t.setHours(0, 0, 0, 0);
      weekStart = sundayOf(t);
      selectInternal(dateToIso(t));
    }

    weekStart = sundayOf(isoToDate(selectedIso));
    renderDows();
    render();

    if (todayBtn) todayBtn.addEventListener("click", jumpToday);
    if (prevBtn)  prevBtn.addEventListener("click", prev);
    if (nextBtn)  nextBtn.addEventListener("click", next);
    if (monthBtn) monthBtn.addEventListener("click", jumpToday);

    window.addEventListener("languagechange", () => { renderDows(); render(); });

    return {
      select: selectInternal,
      today: jumpToday,
      getValue: function () { return selectedIso; },
    };
  }

  function bootAdmin() {
    wireNumpad();
    if (window.i18n && window.i18n.bindToggle) window.i18n.bindToggle($("lang-toggle"));
    renderLog();
    const dateEl = $("history-date");
    if (dateEl) {
      dateEl.value = todayKey();
      renderHistory(dateEl.value);
      // Weekstrip is the visible picker; #history-date is a hidden mirror so
      // existing readers (exports, CSV, etc.) keep working unchanged.
      if ($("weekstrip")) {
        initWeekStrip("weekstrip", dateEl.value, (iso) => {
          dateEl.value = iso;
          renderHistory(iso);
        });
      } else {
        dateEl.addEventListener("change", (e) => renderHistory(e.target.value));
      }
    }
    const btnExp = $("btn-history-export");
    if (btnExp) btnExp.addEventListener("click", () => exportCSV($("history-date").value));
    const btnExpAll = $("btn-history-export-all");
    if (btnExpAll) btnExpAll.addEventListener("click", exportAllCSV);
    const btnClr = $("btn-log-clear");
    if (btnClr) btnClr.addEventListener("click", () => { if (confirm(tt("log.confirmClear"))) clearLog(); });
    const search = $("log-search");
    if (search) search.addEventListener("input", (e) => { logFilterText = e.target.value.toLowerCase().trim(); renderLog(); });
    document.querySelectorAll(".log-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        document.querySelectorAll(".log-chip").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        logFilterType = chip.dataset.type;
        renderLog();
      });
    });
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE.LOG) renderLog();
    });
    window.addEventListener("languagechange", () => { renderLog(); });
  }

  // ---- Remote merge (pull-sync from Supabase) ----
  // Server wins: undo/delete tombstones from any device propagate here.
  // Inserts are idempotent by id. Pulled-only sessions get a minimal shell.
  function shellForRemoteSession(date, lineId, shiftId, operatorId) {
    const sh = shifts.find((x) => x.id === shiftId);
    const alertTimes = sh && sh.startTime && sh.endTime
      ? generateHourlyAlerts(sh.startTime, sh.endTime)
      : config.alertTimes.slice();
    return {
      date, lineId, shiftId, operatorId,
      startedAt: date + "T00:00:00.000Z",
      endedAt: null,
      goodCount: 0, scrapCount: 0,
      hourValue: 0,
      hourStart: date + "T00",
      hourly: {},
      captures: [],
      submissions: [],
      downtime: [],
      currentStatus: "Running",
      alertTimes,
      updatedAt: new Date().toISOString(),
      _remote: true,
    };
  }

  // Window for adding remote rows to the local capture log. Older rows still
  // merge into sessions (History/Charts) but don't flood the bitácora.
  const REMOTE_LOG_WINDOW_MS = 24 * 60 * 60 * 1000;

  function mergeRemoteIntoLog(payload, ownDeviceId) {
    const log = load(STORAGE.LOG, []);
    const seen = new Set();
    for (const e of log) { if (e._remoteId) seen.add(e._remoteId); }
    const now = Date.now();
    let added = 0;

    function recent(ts) {
      if (!ts) return false;
      const t = new Date(ts).getTime();
      return Number.isFinite(t) && (now - t) <= REMOTE_LOG_WINDOW_MS;
    }

    for (const r of payload.captures || []) {
      if (!r.device_id || r.device_id === ownDeviceId) continue;
      if (!recent(r.ts)) continue;
      // Skip captures that already arrived as undone — the matching undo event
      // will be logged separately and a phantom "+N" entry would be confusing.
      if (r.undone) continue;
      const key = "c:" + r.id;
      if (seen.has(key)) continue;
      const isScrap = r.kind === "scrap";
      const message = tt(isScrap ? "log.scrapRemote" : "log.captureRemote", { qty: r.qty });
      log.push({
        ts: r.ts,
        type: isScrap ? "scrap" : "capture",
        message,
        sessionRef: r.session_date + "|" + r.line_id + "|" + r.shift_id + "|" + r.operator_id,
        captureId: r.id,
        _remoteId: key,
        _remoteDeviceId: r.device_id,
      });
      seen.add(key);
      added++;
    }

    for (const e of payload.events || []) {
      if (!e.device_id || e.device_id === ownDeviceId) continue;
      if (!recent(e.ts)) continue;
      const key = "e:" + e.id;
      if (seen.has(key)) continue;
      let type = e.type || "system";
      let message = e.message || "";
      if (type === "capture_undone") { type = "undo"; message = tt("log.undoRemote"); }
      else if (type === "capture_deleted") { type = "undo"; message = tt("log.adminDelRemote"); }
      log.push({
        ts: e.ts,
        type,
        message,
        sessionRef: null,
        captureId: e.capture_id || undefined,
        _remoteId: key,
        _remoteDeviceId: e.device_id,
      });
      seen.add(key);
      added++;
    }

    if (added > 0) {
      log.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
      if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
      save(STORAGE.LOG, log);
      return true;
    }
    return false;
  }

  // Pending tombstones bridge the race where an undo/delete event arrives
  // before the matching capture row (e.g. admin deletes on Device B before
  // Device A finishes flushing its queued capture). Keyed by capture_id.
  const TOMBSTONES_KEY = "prod.sync.pendingTombstones.v1";
  function loadPendingTombstones() {
    try { return JSON.parse(localStorage.getItem(TOMBSTONES_KEY) || "{}"); }
    catch (_) { return {}; }
  }
  function savePendingTombstones(t) {
    try { localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(t)); } catch (_) {}
  }

  function applyRemote(payload) {
    if (!payload) return;
    const all = loadSessions();
    const tombstones = loadPendingTombstones();
    let changed = false;
    let tombstonesChanged = false;

    function findOrCreate(date, lineId, shiftId, operatorId) {
      if (!date || !lineId || !shiftId || !operatorId) return null;
      const k = date + "|" + lineId + "|" + shiftId + "|" + operatorId;
      let s = all.find((x) => sessionKey(x) === k);
      if (!s) {
        s = shellForRemoteSession(date, lineId, shiftId, operatorId);
        all.push(s);
        changed = true;
      }
      return s;
    }

    for (const r of payload.captures || []) {
      const sess = findOrCreate(r.session_date, r.line_id, r.shift_id, r.operator_id);
      if (!sess) continue;
      if (!sess.captures) sess.captures = [];
      const existing = sess.captures.find((c) => c.id === r.id);
      if (existing) {
        // Server-wins: if the server marked it undone, propagate.
        if (r.undone && !existing.undone) { existing.undone = true; changed = true; }
        continue;
      }
      const hasPendingTombstone = !!tombstones[r.id];
      sess.captures.push({
        id: r.id,
        ts: r.ts,
        qty: r.qty,
        kind: r.kind,
        employeeId: r.employee_id || undefined,
        notes: r.notes || undefined,
        forHour: r.for_hour || undefined,
        undone: !!r.undone || hasPendingTombstone,
      });
      if (hasPendingTombstone) {
        delete tombstones[r.id];
        tombstonesChanged = true;
      }
      changed = true;
    }

    for (const r of payload.downtime || []) {
      const sess = findOrCreate(r.session_date, r.line_id, r.shift_id, r.operator_id);
      if (!sess) continue;
      if (!sess.downtime) sess.downtime = [];
      if (!sess.downtime.find((d) => d.id === r.id)) {
        sess.downtime.push({
          id: r.id,
          start: r.start_ts,
          end: r.end_ts || null,
          status: r.status || null,
          durationMs: r.duration_ms || null,
        });
        changed = true;
      }
    }

    for (const r of payload.events || []) {
      if (r.type !== "capture_undone" && r.type !== "capture_deleted") continue;
      const capId = r.capture_id;
      if (!capId) continue;
      let found = false;
      for (const sess of all) {
        const cap = (sess.captures || []).find((c) => c.id === capId);
        if (cap) {
          found = true;
          if (!cap.undone) { cap.undone = true; changed = true; }
          break;
        }
      }
      if (!found) {
        // Capture row hasn't arrived yet — remember the tombstone so we can
        // apply it when it does. TTL cleanup happens in sync.js pull().
        tombstones[capId] = { ts: r.ts || new Date().toISOString(), type: r.type };
        tombstonesChanged = true;
      }
    }

    if (changed) saveSessions(all);
    if (tombstonesChanged) savePendingTombstones(tombstones);
    const logChanged = mergeRemoteIntoLog(payload, payload.ownDeviceId);
    if (changed || logChanged) refreshAfterRemote();
  }

  function refreshAfterRemote() {
    // Counter view present?
    if ($("counter")) {
      renderAll();
      const ch = $("view-charts");
      if (ch && !ch.hidden && typeof renderChartsView === "function") renderChartsView();
    }
    // Admin view present?
    if ($("log-list")) renderLog();
    const hd = $("history-date");
    if (hd && typeof renderHistory === "function") renderHistory(hd.value);
  }

  window.app = Object.assign(window.app || {}, { applyRemote });

  // Drop sessions older than N days so localStorage doesn't fill up over time.
  // Safari iOS caps localStorage at ~5MB; without pruning a high-volume line
  // hits the wall around the 3-month mark.
  const SESSION_RETENTION_DAYS = 30;
  function pruneOldSessions() {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - SESSION_RETENTION_DAYS);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const all = loadSessions();
      const kept = all.filter((s) => s && s.date && s.date >= cutoffStr);
      if (kept.length < all.length) saveSessions(kept);
    } catch (_) {}
  }

  // ---- Boot ----
  function renderSyncStatus(detail) {
    const el = $("sync-status");
    if (!el) return;
    const s = detail || (window.sync && window.sync.getStatus && window.sync.getStatus()) || { enabled: false, pending: 0 };
    el.classList.remove("sync-ok", "sync-pending", "sync-off", "sync-err");
    if (!s.enabled) {
      el.classList.add("sync-off");
      el.textContent = tt("sync.off");
      el.title = tt("sync.offTitle");
      return;
    }
    if (s.lastError) {
      el.classList.add("sync-err");
      el.textContent = tt("sync.error", { n: s.pending });
      el.title = (s.lastError && s.lastError.message) || tt("sync.errorTitle");
      return;
    }
    if (s.pending > 0) {
      el.classList.add("sync-pending");
      el.textContent = tt("sync.pending", { n: s.pending });
      el.title = tt("sync.pendingTitle");
      return;
    }
    el.classList.add("sync-ok");
    el.textContent = tt("sync.ok");
    el.title = s.lastSync ? tt("sync.okTitle", { when: new Date(s.lastSync).toLocaleString(window.i18n ? window.i18n.locale() : "es-MX") }) : tt("sync.ok");
  }

  function boot() {
    pruneOldSessions();
    if ($("counter")) {
      wire();
      wireNumpad();
      if (window.i18n && window.i18n.bindToggle) window.i18n.bindToggle($("lang-toggle"));
      const syncEl = $("sync-status");
      if (syncEl) {
        syncEl.addEventListener("click", () => {
          if (window.sync && window.sync.flush) window.sync.flush();
          if (window.sync && window.sync.pull)  window.sync.pull();
        });
        window.addEventListener("syncstatuschange", (e) => renderSyncStatus(e.detail));
        renderSyncStatus();
      }
      ensureAutoSession();
      renderAll();
      renderLog();
      updateSnoozeButton();
      tick();
      setInterval(tick, 1000);
      setInterval(() => {
        ensureAutoSession();
        const ch = $("view-charts");
        if (ch && !ch.hidden) renderChartsView();
        else renderAll();
      }, 30000);
      window.addEventListener("languagechange", () => {
        renderAll();
        renderLog();
        renderNoteChips();
        updateSnoozeButton();
        renderSyncStatus();
        const ch = $("view-charts");
        if (ch && !ch.hidden) renderChartsView();
      });
      flushPending();
      registerSW();
    } else {
      bootAdmin();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
