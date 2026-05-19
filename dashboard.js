/* Multi-line dashboard.
 *
 * Snapshot view across every configured line: status, current shift
 * production, pace vs target, last-hours sparkline, and last capture.
 *
 * Data sources (all localStorage; sync.js's pull-sync merges remote
 * device data into them automatically because app.js is loaded here
 * and registers window.app.applyRemote):
 *   prod.lines.v1       — configured lines
 *   prod.shifts.v1      — configured shifts
 *   prod.operators.v1   — configured operators
 *   prod.sessions.v1    — sessions (each with captures + downtime)
 *   prod.config.v1      — hourlyTarget etc.
 *
 * Re-renders on:
 *   - syncstatuschange (every pull / flush / status update)
 *   - storage events (cross-tab updates)
 *   - 5-second periodic tick (for elapsed-time-dependent KPIs)
 */
(function () {
  "use strict";

  const STORAGE = {
    LINES:     "prod.lines.v1",
    SHIFTS:    "prod.shifts.v1",
    OPERATORS: "prod.operators.v1",
    SESSIONS:  "prod.sessions.v1",
    CONFIG:    "prod.config.v1",
  };

  function load(k, fb) {
    try { const v = localStorage.getItem(k); return v == null ? fb : JSON.parse(v); }
    catch (_) { return fb; }
  }
  function tt(k, p) { return (window.i18n && window.i18n.t) ? window.i18n.t(k, p) : k; }
  function getLocale() { return (window.i18n && window.i18n.locale) ? window.i18n.locale() : "es-MX"; }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function yesterdayKey() {
    const d = new Date(Date.now() - 86400000);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function deltaPct(today, yest) {
    if (yest == null || yest === 0) return null;
    return Math.round(((today - yest) / yest) * 100);
  }
  function lineOee(session, shift, hourlyTarget) {
    const pace = pacePct(session, shift, hourlyTarget);
    if (pace == null) return null;
    const t = totals(session);
    const denom = t.good + t.scrap;
    const qual = denom > 0 ? t.good / denom : 1;
    return Math.max(0, Math.min(100, Math.round((pace / 100) * qual * 100)));
  }
  function getCss(name) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
    catch (_) { return null; }
  }

  function statusLabel(code) {
    return tt({
      Running:     "top.statusOpt.running",
      Idle:        "top.statusOpt.idle",
      Maintenance: "top.statusOpt.maintenance",
      Breakdown:   "top.statusOpt.breakdown",
    }[code] || code);
  }

  function shiftWindow(s, shift) {
    if (!s || !s.date) return null;
    const [Y, M, D] = s.date.split("-").map(Number);
    if (!shift || !shift.startTime || !shift.endTime) {
      const start = new Date(s.startedAt || new Date(Y, M - 1, D, 6).toISOString());
      return { start, end: new Date(start.getTime() + 12 * 3600000) };
    }
    const [sH, sM] = shift.startTime.split(":").map(Number);
    const [eH, eM] = shift.endTime.split(":").map(Number);
    const start = new Date(Y, M - 1, D, sH, sM, 0, 0);
    let end = new Date(Y, M - 1, D, eH, eM, 0, 0);
    if (end <= start) end = new Date(end.getTime() + 86400000);
    return { start, end };
  }

  function totals(session) {
    let good = 0, scrap = 0;
    for (const c of (session.captures || [])) {
      if (c.undone) continue;
      if (c.kind === "scrap") scrap += Number(c.qty) || 0;
      else good += Number(c.qty) || 0;
    }
    return { good, scrap };
  }

  function lastCapture(session) {
    const caps = (session.captures || []).filter(c => !c.undone);
    return caps.length ? caps[caps.length - 1] : null;
  }

  function pacePct(session, shift, hourlyTarget) {
    const win = shiftWindow(session, shift);
    if (!win) return null;
    const now = new Date();
    if (now < win.start) return null;
    const endCap = now < win.end ? now : win.end;
    const elapsedHrs = (endCap - win.start) / 3600000;
    if (elapsedHrs <= 0.05) return null;
    const expected = hourlyTarget * elapsedHrs;
    if (expected <= 0) return null;
    const t = totals(session);
    return Math.round((t.good / expected) * 100);
  }

  function paceClass(pct) {
    if (pct == null) return "pace-na";
    if (pct >= 100) return "pace-ahead";
    if (pct >= 90)  return "pace-ok";
    if (pct >= 70)  return "pace-warn";
    return "pace-behind";
  }

  function pickSessionForLine(allTodaySessions, lineId) {
    const match = allTodaySessions.filter(s => s.lineId === lineId);
    if (!match.length) return null;
    return match.slice().sort((a, b) =>
      (b.updatedAt || b.startedAt || "").localeCompare(a.updatedAt || a.startedAt || "")
    )[0];
  }

  function operatorName(operators, id) {
    if (!id) return "—";
    const o = (operators || []).find(x => x.id === id);
    return o ? o.name : id;
  }

  function drawSparkline(cv, session) {
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = cv.getBoundingClientRect();
    if (rect.width === 0) return;
    cv.width = rect.width * dpr;
    cv.height = rect.height * dpr;
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);

    const HOURS = 8;
    const now = new Date(); now.setMinutes(0, 0, 0);
    const buckets = [];
    for (let i = HOURS - 1; i >= 0; i--) {
      const t = new Date(now.getTime() - i * 3600000);
      buckets.push({ hour: t.getHours(), value: 0 });
    }
    for (const c of ((session && session.captures) || [])) {
      if (c.undone || c.kind === "scrap") continue;
      const t = new Date(c.ts);
      const diffHr = Math.floor((now.getTime() - t.getTime()) / 3600000);
      if (diffHr >= 0 && diffHr < HOURS) {
        buckets[HOURS - 1 - diffHr].value += (Number(c.qty) || 0);
      }
    }
    const max = Math.max(1, ...buckets.map(b => b.value));
    const bw = w / buckets.length;
    const fill = getCss("--blue") || "#1f7ee0";
    buckets.forEach((b, i) => {
      const bh = (b.value / max) * (h - 6);
      const x = i * bw + 1;
      const y = h - bh - 1;
      ctx.fillStyle = fill;
      const r = Math.min(2, bw / 4);
      // rounded top
      ctx.beginPath();
      ctx.moveTo(x, y + bh);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.lineTo(x + bw - 2 - r, y);
      ctx.quadraticCurveTo(x + bw - 2, y, x + bw - 2, y + r);
      ctx.lineTo(x + bw - 2, y + bh);
      ctx.closePath();
      ctx.fill();
    });
  }

  function buildLineCard(line, session, ctx) {
    const card = document.createElement("article");
    card.className = "line-card";
    if (!session) card.classList.add("line-card-idle-card");

    const head = document.createElement("div");
    head.className = "line-card-head";
    const name = document.createElement("div");
    name.className = "line-card-name";
    const dot = document.createElement("span");
    const status = session ? (session.currentStatus || "Running") : "Idle";
    dot.className = "status-dot-inline" + statusDotClass(status);
    dot.setAttribute("aria-hidden", "true");
    name.appendChild(dot);
    name.appendChild(document.createTextNode(" " + (line.label || line.id)));
    head.appendChild(name);

    const pill = document.createElement("span");
    if (session) {
      pill.className = "status-pill " + statusPillClass(status);
      pill.textContent = statusLabel(status);
    } else {
      pill.className = "status-pill status-paused";
      pill.textContent = tt("dashboard.noActivity");
    }
    head.appendChild(pill);
    card.appendChild(head);

    if (!session) {
      const empty = document.createElement("div");
      empty.className = "line-card-empty muted";
      empty.textContent = tt("dashboard.noActivityHint");
      card.appendChild(empty);
      return card;
    }

    const shift = (ctx.shifts || []).find(s => s.id === session.shiftId);
    const subtitle = document.createElement("div");
    subtitle.className = "line-card-subtitle muted";
    subtitle.textContent = (shift ? shift.label : session.shiftId) +
                          " · " + operatorName(ctx.operators, session.operatorId);
    card.appendChild(subtitle);

    const t = totals(session);
    const pct = pacePct(session, shift, ctx.hourlyTarget);

    const big = document.createElement("div");
    big.className = "line-card-big";
    const count = document.createElement("div");
    count.className = "line-card-count " + paceClass(pct);
    count.textContent = t.good.toLocaleString();
    big.appendChild(count);
    const target = document.createElement("span");
    target.className = "line-card-target muted";
    target.textContent = tt("dashboard.lineCardTarget", { n: ctx.hourlyTarget.toLocaleString() });
    big.appendChild(target);
    card.appendChild(big);

    const spark = document.createElement("canvas");
    spark.className = "line-card-spark";
    card.appendChild(spark);
    requestAnimationFrame(() => drawSparkline(spark, session));

    const meta = document.createElement("div");
    meta.className = "line-card-meta";
    const last = lastCapture(session);
    let leftText = "—";
    if (last) {
      const lastTs = new Date(last.ts);
      const timeStr = lastTs.toLocaleTimeString(getLocale(), { hour: "numeric", minute: "2-digit" });
      leftText = tt("dashboard.lineCardLast", { time: timeStr });
    }
    const oee = lineOee(session, shift, ctx.hourlyTarget);
    const oeeText = oee == null ? "OEE —" : tt("dashboard.lineCardOee", { pct: oee });
    meta.innerHTML =
      '<span class="line-card-meta-left">' + leftText + '</span>' +
      '<span class="line-card-meta-right">' + oeeText + '</span>';
    card.appendChild(meta);

    return card;
  }

  function statusPillClass(status) {
    if (status === "Running")     return "status-active status-running";
    if (status === "Idle")        return "status-paused status-idle";
    if (status === "Maintenance") return "status-completed status-maint";
    if (status === "Breakdown")   return "status-paused status-breakdown";
    return "status-paused";
  }
  function statusDotClass(status) {
    if (status === "Running")     return "";
    if (status === "Idle")        return " idle";
    if (status === "Maintenance") return " warn";
    if (status === "Breakdown")   return " down";
    return " idle";
  }

  function reduceTotals(ctx, sessions) {
    let good = 0, scrap = 0, paceSum = 0, paceCount = 0, active = 0;
    for (const line of ctx.lines) {
      const s = pickSessionForLine(sessions, line.id);
      if (!s) continue;
      active++;
      const t = totals(s);
      good += t.good;
      scrap += t.scrap;
      const shift = (ctx.shifts || []).find(sh => sh.id === s.shiftId);
      const pct = pacePct(s, shift, ctx.hourlyTarget);
      if (pct != null) { paceSum += pct; paceCount++; }
    }
    return { good, scrap, active, avgPace: paceCount ? Math.round(paceSum / paceCount) : null };
  }

  function setDelta(id, delta, invert) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("up", "down", "flat", "delta-up", "delta-down", "delta-flat");
    if (delta == null) {
      el.classList.add("flat");
      el.textContent = "—";
      return;
    }
    const arrow = delta > 0 ? "↑" : (delta < 0 ? "↓" : "—");
    el.textContent = arrow + " " + Math.abs(delta) + "%";
    // For metrics where lower is better (scrap), invert color semantic
    let cls;
    if (delta === 0) cls = "flat";
    else if (invert) cls = delta > 0 ? "down" : "up";
    else cls = delta > 0 ? "up" : "down";
    el.classList.add(cls);
  }

  function renderSummary(ctx, sessions) {
    const today = reduceTotals(ctx, sessions);
    const yIso = yesterdayKey();
    const ySessions = (load(STORAGE.SESSIONS, []) || []).filter(s => s && s.date === yIso);
    const yest = reduceTotals(ctx, ySessions);

    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setText("ds-total-good", today.good.toLocaleString());
    setText("ds-total-scrap", today.scrap.toLocaleString());
    setText("ds-active-lines", today.active + " / " + ctx.lines.length);
    setText("ds-avg-pace", today.avgPace != null ? today.avgPace + "%" : "—");

    setDelta("ds-total-good-delta", deltaPct(today.good, yest.good), false);
    setDelta("ds-total-scrap-delta", deltaPct(today.scrap, yest.scrap), true);
    setDelta("ds-avg-pace-delta", deltaPct(today.avgPace, yest.avgPace), false);

    const paceTile = document.getElementById("ds-avg-pace");
    if (paceTile) paceTile.className = "ds-value " + paceClass(today.avgPace);
  }

  function renderShiftPill(ctx, sessions) {
    const r = reduceTotals(ctx, sessions);
    const text = tt("dashboard.shiftPill", {
      active: r.active,
      total: ctx.lines.length,
      oee: r.avgPace != null ? r.avgPace : "—"
    });
    const el = document.getElementById("shift-pill-text");
    if (el) el.textContent = text;
  }

  function render() {
    const ctx = {
      lines:     load(STORAGE.LINES, []),
      shifts:    load(STORAGE.SHIFTS, []),
      operators: load(STORAGE.OPERATORS, []),
      config:    load(STORAGE.CONFIG, {}),
    };
    ctx.hourlyTarget = (ctx.config && ctx.config.hourlyTarget) || 420;

    const today = todayKey();
    const allSessions = (load(STORAGE.SESSIONS, []) || []).filter(s => s && s.date === today);

    const grid = document.getElementById("dashboard-grid");
    const emptyEl = document.getElementById("dashboard-empty");
    if (!grid) return;

    if (!ctx.lines.length) {
      grid.innerHTML = "";
      if (emptyEl) emptyEl.classList.remove("hidden");
    } else {
      if (emptyEl) emptyEl.classList.add("hidden");
      grid.innerHTML = "";
      const filter = currentFilter();
      for (const line of ctx.lines) {
        const s = pickSessionForLine(allSessions, line.id);
        if (filter === "active" && !s) continue;
        if (filter === "idle" && s) continue;
        grid.appendChild(buildLineCard(line, s, ctx));
      }
    }

    renderSummary(ctx, allSessions);
    renderShiftPill(ctx, allSessions);

    const countEl = document.getElementById("dashboard-lines-count");
    if (countEl) countEl.textContent = ctx.lines.length;
    const countSub = document.getElementById("dashboard-lines-count-sub");
    if (countSub) countSub.textContent = ctx.lines.length;

    const dateEl = document.getElementById("dashboard-date");
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString(getLocale(), {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });
    }
  }

  function renderSyncStatus(detail) {
    const el = document.getElementById("sync-status");
    if (!el) return;
    const s = detail || (window.sync && window.sync.getStatus && window.sync.getStatus())
            || { enabled: false, pending: 0 };
    el.classList.remove("sync-ok", "sync-pending", "sync-off", "sync-err");
    if (!s.enabled) { el.classList.add("sync-off"); el.textContent = tt("sync.off"); return; }
    if (s.lastError) { el.classList.add("sync-err"); el.textContent = tt("sync.error", { n: s.pending }); el.title = (s.lastError && s.lastError.message) || ""; return; }
    if (s.pending > 0) { el.classList.add("sync-pending"); el.textContent = tt("sync.pending", { n: s.pending }); return; }
    el.classList.add("sync-ok"); el.textContent = tt("sync.ok");
  }

  let _filter = "all";
  function currentFilter() { return _filter; }
  function bindFilterChips() {
    const chips = document.querySelectorAll(".lines-filter .filter-chip");
    chips.forEach(chip => {
      chip.addEventListener("click", () => {
        _filter = chip.getAttribute("data-filter") || "all";
        chips.forEach(c => c.classList.toggle("active", c === chip));
        render();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindFilterChips();
    render();
    renderSyncStatus();
    if (window.i18n && window.i18n.bindToggle) {
      window.i18n.bindToggle(document.getElementById("lang-toggle"));
    }
    const syncEl = document.getElementById("sync-status");
    if (syncEl) {
      syncEl.addEventListener("click", () => {
        if (window.sync && window.sync.flush) window.sync.flush();
        if (window.sync && window.sync.pull)  window.sync.pull();
      });
    }
    window.addEventListener("syncstatuschange", (e) => {
      renderSyncStatus(e.detail);
      render();
    });
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE.SESSIONS || e.key === STORAGE.LINES
          || e.key === STORAGE.SHIFTS || e.key === STORAGE.OPERATORS) render();
    });
    window.addEventListener("languagechange", render);
    setInterval(render, 5000);
  });
})();
