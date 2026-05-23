(function () {
  "use strict";

  const STORAGE = {
    CONFIG: "prod.config.v1",
    LINES: "prod.lines.v1",
    SHIFTS: "prod.shifts.v1",
    OPERATORS: "prod.operators.v1",
    DEVICE: "prod.device.v1",
    SUBMISSIONS: "prod.submissions.v1",
    SESSIONS: "prod.sessions.v1",
    LAST_FIRED: "prod.lastFired.v1",
    LOG: "prod.log.v1",
    ADMIN_PWD: "prod.admin.password.v1",
  };
  const SESSION_UNLOCK = "prod.admin.unlocked.v1";

  function tt(key, params) { return (window.i18n && window.i18n.t) ? window.i18n.t(key, params) : key; }

  function adminPwd() { try { return JSON.parse(localStorage.getItem(STORAGE.ADMIN_PWD)) || "1234"; } catch (_) { return "1234"; } }
  function isUnlocked() { return sessionStorage.getItem(SESSION_UNLOCK) === "1"; }
  function setUnlocked(v) { if (v) sessionStorage.setItem(SESSION_UNLOCK, "1"); else sessionStorage.removeItem(SESSION_UNLOCK); }

  function gateInit() {
    const lock = document.getElementById("admin-lock");
    const main = document.getElementById("admin-main");
    if (!lock || !main) return;

    // Gate disabled for testing phase — admin loads unconditionally.
    // Helpers + lock-form listener preserved so the gate can be restored
    // by flipping ADMIN_GATE_ENABLED to true.
    const ADMIN_GATE_ENABLED = false;

    const showLock = () => {
      lock.classList.remove("hidden");
      lock.setAttribute("aria-hidden", "false");
      main.style.display = "none";
      setTimeout(() => { const p = document.getElementById("lock-pwd"); if (p) p.focus(); }, 50);
    };
    const showMain = () => {
      lock.classList.add("hidden");
      lock.setAttribute("aria-hidden", "true");
      main.style.display = "";
    };

    if (!ADMIN_GATE_ENABLED) {
      setUnlocked(true);
      showMain();
      const lockBtn = document.getElementById("btn-admin-lock");
      if (lockBtn) lockBtn.style.display = "none";
    } else if (!isUnlocked()) {
      showLock();
    } else {
      showMain();
    }

    document.getElementById("lock-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("lock-pwd").value;
      if (val === adminPwd()) {
        setUnlocked(true);
        document.getElementById("lock-error").classList.add("hidden");
        showMain();
        if (typeof onAdminUnlocked === "function") onAdminUnlocked();
      } else {
        document.getElementById("lock-error").classList.remove("hidden");
      }
    });
    document.getElementById("btn-admin-lock").addEventListener("click", () => {
      if (!ADMIN_GATE_ENABLED) return;
      setUnlocked(false);
      showLock();
    });
    document.getElementById("btn-change-pwd").addEventListener("click", () => {
      const v = document.getElementById("new-admin-pwd").value;
      if (!v || v.length < 3) return alert(tt("admin.pwdTooShort"));
      localStorage.setItem(STORAGE.ADMIN_PWD, JSON.stringify(v));
      document.getElementById("new-admin-pwd").value = "";
      const f = document.getElementById("pwd-flash");
      f.classList.add("show");
      setTimeout(() => f.classList.remove("show"), 1600);
      logEvent("config", tt("admin.log.pwdChanged"));
    });
  }
  let onAdminUnlocked = null;

  const LOG_MAX = 500;

  const DEFAULTS = {
    alertTimes: ["09:00", "12:00", "15:00", "18:00"],
    snoozeMinutes: 5,
    hourlyTarget: 420,
    audioEnabled: true,
    audioVolume: 0.6,
  };

  const DEFAULT_LINES = [
    { id: "L-60ML", label: "#1 60ml Neomed Syringe" },
    { id: "L-35ML", label: "#2 35ml Neomed Syringe" },
  ];
  const DEFAULT_SHIFTS = [
    { id: "S1", label: "Turno 1", startTime: "06:00", endTime: "18:00", days: [0, 1, 2, 3, 4, 5, 6],
      breaks: [{ start: "10:00", end: "10:15" }, { start: "13:00", end: "13:15" }] },
    { id: "S2", label: "Turno 2", startTime: "18:30", endTime: "05:00", days: [0, 1, 2, 3, 4, 5, 6],
      breaks: [{ start: "22:00", end: "22:15" }, { start: "01:30", end: "01:45" }] },
  ];
  const DEFAULT_OPERATORS = [
    { id: "OP-0847", name: "Operador Demo" },
  ];

  const form = document.getElementById("admin-form");
  const flash = document.getElementById("saved-flash");

  const load = (key, fb) => {
    try { const raw = localStorage.getItem(key); return raw == null ? fb : JSON.parse(raw); }
    catch (_) { return fb; }
  };
  // Map of localStorage keys that mirror shared catalogs / settings in the
  // Supabase config table. save() automatically pushes these so admin edits
  // propagate to peer tablets on their next pull.
  const SAVE_TO_CONFIG = {};
  SAVE_TO_CONFIG[STORAGE.LINES]     = "lines";
  SAVE_TO_CONFIG[STORAGE.SHIFTS]    = "shifts";
  SAVE_TO_CONFIG[STORAGE.OPERATORS] = "operators";
  SAVE_TO_CONFIG[STORAGE.CONFIG]    = "settings";
  SAVE_TO_CONFIG["prod.downtime.reasons.v1"] = "downtime_reasons";
  SAVE_TO_CONFIG["prod.scrap.reasons.v1"]    = "scrap_reasons";
  const save = (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {}
    const ck = SAVE_TO_CONFIG[key];
    if (ck && window.sync && typeof window.sync.pushConfig === "function") {
      try { window.sync.pushConfig(ck, val); } catch (_) {}
    }
  };

  function logEvent(type, message) {
    const entries = load(STORAGE.LOG, []);
    entries.push({ ts: new Date().toISOString(), type, message });
    if (entries.length > LOG_MAX) entries.splice(0, entries.length - LOG_MAX);
    save(STORAGE.LOG, entries);
  }

  function loadCfg() {
    return Object.assign({}, DEFAULTS, load(STORAGE.CONFIG, {}));
  }

  function populate(cfg) {
    form.elements.snoozeMinutes.value = cfg.snoozeMinutes;
    form.elements.hourlyTarget.value = cfg.hourlyTarget;
    form.elements.audioEnabled.value = cfg.audioEnabled ? "true" : "false";
    form.elements.audioVolume.value = cfg.audioVolume;
  }

  function parseTimes(raw) {
    return raw.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
      .filter((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t))
      .map((t) => { const [h, m] = t.split(":"); return h.padStart(2, "0") + ":" + m; });
  }

  function showFlash() {
    flash.classList.add("show");
    setTimeout(() => flash.classList.remove("show"), 1600);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const cfg = {
      alertTimes: DEFAULTS.alertTimes.slice(),
      snoozeMinutes: Math.max(1, Math.min(60, Number(form.elements.snoozeMinutes.value) || DEFAULTS.snoozeMinutes)),
      hourlyTarget: Math.max(0, Number(form.elements.hourlyTarget.value) || 0),
      audioEnabled: form.elements.audioEnabled.value === "true",
      audioVolume: Math.max(0, Math.min(1, Number(form.elements.audioVolume.value) || 0)),
    };
    save(STORAGE.CONFIG, cfg);
    populate(cfg);
    showFlash();
    logEvent("config", tt("admin.log.cfgSaved", { target: cfg.hourlyTarget }));
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    localStorage.removeItem(STORAGE.CONFIG);
    populate(loadCfg());
    showFlash();
    logEvent("config", tt("admin.log.cfgReset"));
  });

  document.getElementById("btn-clear-data").addEventListener("click", async () => {
    if (!(await window.appConfirm(tt("admin.confirmClearToday"), { danger: true }))) return;
    localStorage.removeItem(STORAGE.SUBMISSIONS);
    localStorage.removeItem(STORAGE.LAST_FIRED);
    showFlash();
    logEvent("clear", tt("admin.log.clearedToday"));
  });

  document.getElementById("btn-clear-sessions").addEventListener("click", async () => {
    if (!(await window.appConfirm(tt("admin.confirmClearSessions"), { danger: true }))) return;
    localStorage.removeItem(STORAGE.SESSIONS);
    showFlash();
    logEvent("clear", tt("admin.log.clearedSessions"));
  });

  const resetTodayBtn = document.getElementById("btn-reset-today-cloud");
  if (resetTodayBtn) resetTodayBtn.addEventListener("click", async () => {
    function pad2(n) { return n < 10 ? "0" + n : "" + n; }
    const d = new Date();
    const iso = d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
    if (!(await window.appConfirm(tt("admin.confirmResetTodayCloud", { date: iso }), { danger: true }))) return;

    resetTodayBtn.disabled = true;
    const origText = resetTodayBtn.textContent;
    resetTodayBtn.textContent = tt("admin.resetTodayCloudBusy");

    let cloud = { ok: true, errors: [] };
    if (window.sync && typeof window.sync.deleteDate === "function") {
      cloud = await window.sync.deleteDate(iso);
    } else {
      cloud = { ok: false, errors: ["sync no disponible"] };
    }

    // Local cleanup regardless of cloud result so a partial failure still
    // leaves the device in a consistent state and the user can retry.
    const sessions = load(STORAGE.SESSIONS, []);
    const sessionsKept = sessions.filter((s) => s && s.date !== iso);
    save(STORAGE.SESSIONS, sessionsKept);
    const log = load(STORAGE.LOG, []);
    const logKept = log.filter((e) => !(e && typeof e.ts === "string" && e.ts.slice(0, 10) === iso));
    save(STORAGE.LOG, logKept);
    localStorage.removeItem(STORAGE.LAST_FIRED);

    resetTodayBtn.disabled = false;
    resetTodayBtn.textContent = origText;

    if (cloud.ok) {
      showFlash();
      logEvent("clear", tt("admin.log.resetTodayCloud", { date: iso }));
    } else {
      logEvent("clear", tt("admin.log.resetTodayCloudPartial", { date: iso }));
      alert(tt("admin.resetTodayCloudPartial") + "\n\n" + cloud.errors.join("\n\n"));
    }
  });

  // ---- Entity tables ----
  function renderEntities() {
    renderLines();
    renderShifts();
    renderOperators();
    renderReasonList("downtime");
    renderReasonList("scrap");
  }

  // ---- Reason lists (downtime / scrap motivos) ----
  const REASON_DEFAULTS = {
    downtime: ["Junta de producción", "Capacitación", "Cambio de material",
               "Limpieza", "Falta de material", "Otro"],
    scrap:    ["Pistón roto", "Empaque defectuoso", "Calidad fuera de spec", "Otro"],
  };
  const REASON_STORAGE = {
    downtime: "prod.downtime.reasons.v1",
    scrap:    "prod.scrap.reasons.v1",
  };
  function loadReasons(which) {
    return load(REASON_STORAGE[which], REASON_DEFAULTS[which].slice());
  }
  function saveReasons(which, list) {
    save(REASON_STORAGE[which], list);
  }
  function renderReasonList(which) {
    const ul = document.getElementById(which + "-reasons-list");
    if (!ul) return;
    const list = loadReasons(which);
    ul.innerHTML = list.map((r, i) =>
      '<li class="reason-item">' +
        '<span class="reason-text">' + escapeHtml(r) + '</span>' +
        '<button type="button" class="btn btn-ghost btn-small" data-idx="' + i + '">' + escapeHtml(tt("admin.btn.delete")) + '</button>' +
      '</li>'
    ).join("");
    ul.querySelectorAll("button[data-idx]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const idx = Number(btn.dataset.idx);
        const cur = loadReasons(which);
        const removed = cur[idx];
        if (!(await window.appConfirm(tt("admin.confirmDelReason", { name: removed }), { danger: true }))) return;
        cur.splice(idx, 1);
        saveReasons(which, cur);
        renderReasonList(which);
        logEvent("config", tt("admin.log.reasonRemoved", { which, name: removed }));
      });
    });
  }
  function wireReasonAdd(which) {
    const inp = document.getElementById("new-" + which + "-reason");
    const btn = document.getElementById("btn-add-" + which + "-reason");
    if (!inp || !btn) return;
    btn.addEventListener("click", () => {
      const v = (inp.value || "").trim();
      if (!v) return;
      const cur = loadReasons(which);
      if (cur.indexOf(v) !== -1) { inp.value = ""; return; }
      cur.push(v);
      saveReasons(which, cur);
      inp.value = "";
      renderReasonList(which);
      logEvent("config", tt("admin.log.reasonAdded", { which, name: v }));
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); btn.click(); }
    });
  }
  wireReasonAdd("downtime");
  wireReasonAdd("scrap");

  let editingLineIdx = -1;
  function renderLines() {
    const tbody = document.getElementById("lines-tbody");
    const list = load(STORAGE.LINES, DEFAULT_LINES);
    tbody.innerHTML = list.map((l, i) => {
      if (i === editingLineIdx) {
        return `
          <tr class="editing">
            <td><input class="cell-edit" data-f="id" value="${escapeHtml(l.id)}"></td>
            <td><input class="cell-edit" data-f="label" value="${escapeHtml(l.label)}"></td>
            <td>
              <button type="button" class="btn btn-success btn-small" data-act="save-line">${escapeHtml(tt("btn.save"))}</button>
              <button type="button" class="btn btn-ghost btn-small" data-act="cancel-line">${escapeHtml(tt("btn.cancel"))}</button>
            </td>
          </tr>`;
      }
      return `
        <tr>
          <td><code>${escapeHtml(l.id)}</code></td>
          <td>${escapeHtml(l.label)}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-small" data-idx="${i}" data-act="edit-line">${escapeHtml(tt("admin.btn.edit"))}</button>
            <button type="button" class="btn btn-ghost btn-small" data-idx="${i}" data-act="del-line">${escapeHtml(tt("admin.btn.delete"))}</button>
          </td>
        </tr>`;
    }).join("");
    tbody.querySelectorAll('[data-act="del-line"]').forEach((b) => b.addEventListener("click", () => removeLine(Number(b.dataset.idx))));
    tbody.querySelectorAll('[data-act="edit-line"]').forEach((b) => b.addEventListener("click", () => { editingLineIdx = Number(b.dataset.idx); renderLines(); }));
    tbody.querySelectorAll('[data-act="cancel-line"]').forEach((b) => b.addEventListener("click", () => { editingLineIdx = -1; renderLines(); }));
    tbody.querySelectorAll('[data-act="save-line"]').forEach((b) => b.addEventListener("click", () => {
      const row = b.closest("tr");
      const id = row.querySelector('[data-f="id"]').value.trim();
      const label = row.querySelector('[data-f="label"]').value.trim();
      if (!id || !label) return alert(tt("admin.alert.idLabel"));
      const all = load(STORAGE.LINES, DEFAULT_LINES);
      if (id !== all[editingLineIdx].id && all.some((x, j) => j !== editingLineIdx && x.id === id)) return alert(tt("admin.alert.idDup"));
      all[editingLineIdx] = { id, label };
      save(STORAGE.LINES, all);
      logEvent("config", tt("admin.log.lineEdited", { id, label }));
      editingLineIdx = -1;
      renderLines();
    }));
  }

  function dayLabel(n) { return tt("day." + n); }
  function fmt12FromHHMM(hhmm) {
    if (!hhmm) return "—";
    const [hh, mm] = hhmm.split(":").map(Number);
    const ampm = hh >= 12 ? "PM" : "AM";
    let h = hh % 12; if (h === 0) h = 12;
    return h + ":" + (mm < 10 ? "0" + mm : mm) + " " + ampm;
  }

  let editingShiftIdx = -1;
  function renderShifts() {
    const tbody = document.getElementById("shifts-tbody");
    const list = load(STORAGE.SHIFTS, DEFAULT_SHIFTS);
    tbody.innerHTML = list.map((s, i) => {
      const days = (s.days || []).map((d) => dayLabel(d)).join(", ") || "—";
      const breaks = (s.breaks || []).map((b) => fmt12FromHHMM(b.start) + "-" + fmt12FromHHMM(b.end)).join(", ") || "—";
      if (i === editingShiftIdx) {
        return `
          <tr class="editing">
            <td><input class="cell-edit" data-f="id" value="${escapeHtml(s.id)}"></td>
            <td><input class="cell-edit" data-f="label" value="${escapeHtml(s.label)}"></td>
            <td><input class="cell-edit" data-f="startTime" type="time" value="${escapeHtml(s.startTime || '')}"></td>
            <td><input class="cell-edit" data-f="endTime" type="time" value="${escapeHtml(s.endTime || '')}"></td>
            <td><input class="cell-edit" data-f="days" value="${escapeHtml((s.days || []).join(','))}" placeholder="0,1,2,3,4,5,6"></td>
            <td><small>${escapeHtml(breaks)}</small></td>
            <td>
              <button type="button" class="btn btn-success btn-small" data-act="save-shift">${escapeHtml(tt("btn.save"))}</button>
              <button type="button" class="btn btn-ghost btn-small" data-act="cancel-shift">${escapeHtml(tt("btn.cancel"))}</button>
            </td>
          </tr>`;
      }
      return `
        <tr>
          <td><code>${escapeHtml(s.id)}</code></td>
          <td>${escapeHtml(s.label)}</td>
          <td>${escapeHtml(fmt12FromHHMM(s.startTime))}</td>
          <td>${escapeHtml(fmt12FromHHMM(s.endTime))}</td>
          <td>${escapeHtml(days)}</td>
          <td><small>${escapeHtml(breaks)}</small></td>
          <td>
            <button type="button" class="btn btn-ghost btn-small" data-idx="${i}" data-act="edit-shift">${escapeHtml(tt("admin.btn.edit"))}</button>
            <button type="button" class="btn btn-ghost btn-small" data-idx="${i}" data-act="edit-breaks">${escapeHtml(tt("admin.btn.breaks"))}</button>
            <button type="button" class="btn btn-ghost btn-small" data-idx="${i}" data-act="del-shift">${escapeHtml(tt("admin.btn.delete"))}</button>
          </td>
        </tr>`;
    }).join("");
    tbody.querySelectorAll('[data-act="del-shift"]').forEach((b) => b.addEventListener("click", () => removeShift(Number(b.dataset.idx))));
    tbody.querySelectorAll('[data-act="edit-breaks"]').forEach((b) => b.addEventListener("click", () => editBreaks(Number(b.dataset.idx))));
    tbody.querySelectorAll('[data-act="edit-shift"]').forEach((b) => b.addEventListener("click", () => { editingShiftIdx = Number(b.dataset.idx); renderShifts(); }));
    tbody.querySelectorAll('[data-act="cancel-shift"]').forEach((b) => b.addEventListener("click", () => { editingShiftIdx = -1; renderShifts(); }));
    tbody.querySelectorAll('[data-act="save-shift"]').forEach((b) => b.addEventListener("click", () => {
      const row = b.closest("tr");
      const id = row.querySelector('[data-f="id"]').value.trim();
      const label = row.querySelector('[data-f="label"]').value.trim();
      const startTime = row.querySelector('[data-f="startTime"]').value.trim();
      const endTime = row.querySelector('[data-f="endTime"]').value.trim();
      const daysRaw = row.querySelector('[data-f="days"]').value.trim();
      if (!id || !label || !startTime || !endTime) return alert(tt("admin.alert.allReq"));
      if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return alert(tt("admin.alert.timeFmt"));
      const days = daysRaw.split(/[,\s]+/).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      const all = load(STORAGE.SHIFTS, DEFAULT_SHIFTS);
      if (id !== all[editingShiftIdx].id && all.some((x, j) => j !== editingShiftIdx && x.id === id)) return alert(tt("admin.alert.idDup"));
      const prev = all[editingShiftIdx];
      all[editingShiftIdx] = { id, label, startTime, endTime, days, breaks: prev.breaks || [] };
      save(STORAGE.SHIFTS, all);
      logEvent("config", tt("admin.log.shiftEdited", { id }));
      editingShiftIdx = -1;
      renderShifts();
    }));
  }

  let breaksEditingIdx = -1;
  let breaksDraft = [];

  function renderBreaksList() {
    const wrap = document.getElementById("breaks-list");
    wrap.innerHTML = breaksDraft.map((b, i) => `
      <div class="break-row">
        <input type="time" data-i="${i}" data-f="start" value="${escapeHtml(b.start || '')}">
        <input type="time" data-i="${i}" data-f="end" value="${escapeHtml(b.end || '')}">
        <button type="button" class="btn btn-ghost btn-small" data-i="${i}" data-act="del-break">✕</button>
      </div>`).join("") || '<div class="muted" style="font-size:13px">' + escapeHtml(tt("breaks.empty")) + '</div>';
    wrap.querySelectorAll("input").forEach((inp) => {
      inp.addEventListener("input", () => {
        const i = Number(inp.dataset.i);
        breaksDraft[i][inp.dataset.f] = inp.value;
      });
    });
    wrap.querySelectorAll('[data-act="del-break"]').forEach((b) => {
      b.addEventListener("click", () => {
        breaksDraft.splice(Number(b.dataset.i), 1);
        renderBreaksList();
      });
    });
  }

  function editBreaks(idx) {
    const list = load(STORAGE.SHIFTS, DEFAULT_SHIFTS);
    const sh = list[idx];
    breaksEditingIdx = idx;
    breaksDraft = (sh.breaks || []).map((b) => ({ start: b.start, end: b.end }));
    document.getElementById("breaks-shift-label").textContent = sh.label;
    renderBreaksList();
    const ov = document.getElementById("breaks-overlay");
    ov.classList.remove("hidden");
    ov.setAttribute("aria-hidden", "false");
  }

  function closeBreaks() {
    const ov = document.getElementById("breaks-overlay");
    ov.classList.add("hidden");
    ov.setAttribute("aria-hidden", "true");
    breaksEditingIdx = -1;
    breaksDraft = [];
  }

  document.getElementById("btn-break-add").addEventListener("click", () => {
    breaksDraft.push({ start: "", end: "" });
    renderBreaksList();
  });
  document.getElementById("btn-breaks-cancel").addEventListener("click", closeBreaks);
  document.getElementById("btn-breaks-save").addEventListener("click", () => {
    const valid = breaksDraft.filter((b) => /^\d{2}:\d{2}$/.test(b.start) && /^\d{2}:\d{2}$/.test(b.end));
    if (valid.length !== breaksDraft.length) return alert(tt("admin.alert.breakReq"));
    const list = load(STORAGE.SHIFTS, DEFAULT_SHIFTS);
    list[breaksEditingIdx].breaks = valid;
    save(STORAGE.SHIFTS, list);
    logEvent("config", tt("admin.log.breaksUpdated", { id: list[breaksEditingIdx].id }));
    closeBreaks();
    renderShifts();
  });

  let editingOpIdx = -1;
  function renderOperators() {
    const tbody = document.getElementById("operators-tbody");
    const list = load(STORAGE.OPERATORS, DEFAULT_OPERATORS);
    tbody.innerHTML = list.map((o, i) => {
      if (i === editingOpIdx) {
        return `
          <tr class="editing">
            <td><input class="cell-edit" data-f="id" value="${escapeHtml(o.id)}"></td>
            <td><input class="cell-edit" data-f="name" value="${escapeHtml(o.name)}"></td>
            <td>
              <button type="button" class="btn btn-success btn-small" data-act="save-op">${escapeHtml(tt("btn.save"))}</button>
              <button type="button" class="btn btn-ghost btn-small" data-act="cancel-op">${escapeHtml(tt("btn.cancel"))}</button>
            </td>
          </tr>`;
      }
      return `
        <tr>
          <td><code>${escapeHtml(o.id)}</code></td>
          <td>${escapeHtml(o.name)}</td>
          <td>
            <button type="button" class="btn btn-ghost btn-small" data-idx="${i}" data-act="edit-op">${escapeHtml(tt("admin.btn.edit"))}</button>
            <button type="button" class="btn btn-ghost btn-small" data-idx="${i}" data-act="del-op">${escapeHtml(tt("admin.btn.delete"))}</button>
          </td>
        </tr>`;
    }).join("");
    tbody.querySelectorAll('[data-act="del-op"]').forEach((b) => b.addEventListener("click", () => removeOperator(Number(b.dataset.idx))));
    tbody.querySelectorAll('[data-act="edit-op"]').forEach((b) => b.addEventListener("click", () => { editingOpIdx = Number(b.dataset.idx); renderOperators(); }));
    tbody.querySelectorAll('[data-act="cancel-op"]').forEach((b) => b.addEventListener("click", () => { editingOpIdx = -1; renderOperators(); }));
    tbody.querySelectorAll('[data-act="save-op"]').forEach((b) => b.addEventListener("click", () => {
      const row = b.closest("tr");
      const id = row.querySelector('[data-f="id"]').value.trim();
      const name = row.querySelector('[data-f="name"]').value.trim();
      if (!id || !name) return alert(tt("admin.alert.idName"));
      const all = load(STORAGE.OPERATORS, DEFAULT_OPERATORS);
      if (id !== all[editingOpIdx].id && all.some((x, j) => j !== editingOpIdx && x.id === id)) return alert(tt("admin.alert.idDup"));
      all[editingOpIdx] = { id, name };
      save(STORAGE.OPERATORS, all);
      logEvent("config", tt("admin.log.opEdited", { id, name }));
      editingOpIdx = -1;
      renderOperators();
    }));
  }

  function addLine() {
    const id = document.getElementById("new-line-id").value.trim();
    const label = document.getElementById("new-line-label").value.trim();
    if (!id || !label) return alert(tt("admin.alert.idLabel"));
    const list = load(STORAGE.LINES, DEFAULT_LINES);
    if (list.some((x) => x.id === id)) return alert(tt("admin.alert.idDup"));
    list.push({ id, label });
    save(STORAGE.LINES, list);
    logEvent("config", tt("admin.log.lineAdded", { id, label }));
    document.getElementById("new-line-id").value = "";
    document.getElementById("new-line-label").value = "";
    renderLines();
  }

  async function removeLine(idx) {
    const list = load(STORAGE.LINES, DEFAULT_LINES);
    if (!(await window.appConfirm(tt("admin.confirmDelLine", { id: list[idx].id }), { danger: true }))) return;
    const removed = list.splice(idx, 1)[0];
    save(STORAGE.LINES, list);
    logEvent("config", tt("admin.log.lineRemoved", { id: removed.id }));
    renderLines();
  }

  function addShift() {
    const id = document.getElementById("new-shift-id").value.trim();
    const label = document.getElementById("new-shift-label").value.trim();
    const startTime = document.getElementById("new-shift-start").value.trim();
    const endTime = document.getElementById("new-shift-end").value.trim();
    const daysRaw = document.getElementById("new-shift-days").value.trim();
    if (!id || !label || !startTime || !endTime) return alert(tt("admin.alert.allShift"));
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return alert(tt("admin.alert.timeHHMM"));
    const days = daysRaw
      ? daysRaw.split(/[,\s]+/).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      : [];
    const list = load(STORAGE.SHIFTS, DEFAULT_SHIFTS);
    if (list.some((x) => x.id === id)) return alert(tt("admin.alert.idDup"));
    list.push({ id, label, startTime, endTime, days });
    save(STORAGE.SHIFTS, list);
    logEvent("config", tt("admin.log.shiftAdded", { id, label, start: startTime, end: endTime }));
    ["new-shift-id", "new-shift-label", "new-shift-start", "new-shift-end", "new-shift-days"].forEach((id) => document.getElementById(id).value = "");
    renderShifts();
  }

  async function removeShift(idx) {
    const list = load(STORAGE.SHIFTS, DEFAULT_SHIFTS);
    if (!(await window.appConfirm(tt("admin.confirmDelShift", { id: list[idx].id }), { danger: true }))) return;
    const removed = list.splice(idx, 1)[0];
    save(STORAGE.SHIFTS, list);
    logEvent("config", tt("admin.log.shiftRemoved", { id: removed.id }));
    renderShifts();
  }

  function addOperator() {
    const id = document.getElementById("new-op-id").value.trim();
    const name = document.getElementById("new-op-name").value.trim();
    if (!id || !name) return alert(tt("admin.alert.idName"));
    const list = load(STORAGE.OPERATORS, DEFAULT_OPERATORS);
    if (list.some((x) => x.id === id)) return alert(tt("admin.alert.idDup"));
    list.push({ id, name });
    save(STORAGE.OPERATORS, list);
    logEvent("config", tt("admin.log.opAdded", { id, name }));
    document.getElementById("new-op-id").value = "";
    document.getElementById("new-op-name").value = "";
    renderOperators();
  }

  async function removeOperator(idx) {
    const list = load(STORAGE.OPERATORS, DEFAULT_OPERATORS);
    if (!(await window.appConfirm(tt("admin.confirmDelOp", { id: list[idx].id }), { danger: true }))) return;
    const removed = list.splice(idx, 1)[0];
    save(STORAGE.OPERATORS, list);
    logEvent("config", tt("admin.log.opRemoved", { id: removed.id }));
    renderOperators();
  }

  document.getElementById("btn-add-line").addEventListener("click", addLine);
  document.getElementById("btn-add-shift").addEventListener("click", addShift);
  document.getElementById("btn-add-op").addEventListener("click", addOperator);

  // ---- Device defaults ----
  function loadDevice() {
    const ls = load(STORAGE.LINES, DEFAULT_LINES);
    const ops = load(STORAGE.OPERATORS, DEFAULT_OPERATORS);
    return load(STORAGE.DEVICE, { lineId: ls[0] && ls[0].id, operatorId: ops[0] && ops[0].id });
  }

  function populateDevice() {
    const ls = load(STORAGE.LINES, DEFAULT_LINES);
    const ops = load(STORAGE.OPERATORS, DEFAULT_OPERATORS);
    const d = loadDevice();
    const lineSel = document.getElementById("device-line");
    const opSel = document.getElementById("device-operator");
    lineSel.innerHTML = ls.map((l) => `<option value="${escapeHtml(l.id)}"${l.id === d.lineId ? " selected" : ""}>${escapeHtml(l.label)}</option>`).join("");
    opSel.innerHTML = ops.map((o) => `<option value="${escapeHtml(o.id)}"${o.id === d.operatorId ? " selected" : ""}>${escapeHtml(o.name + " (" + o.id + ")")}</option>`).join("");
  }

  function flashDevice() {
    const el = document.getElementById("device-flash");
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 1600);
  }

  document.getElementById("btn-device-save").addEventListener("click", () => {
    const lineId = document.getElementById("device-line").value;
    const operatorId = document.getElementById("device-operator").value;
    save(STORAGE.DEVICE, { lineId, operatorId });
    logEvent("config", tt("admin.log.device", { line: lineId, op: operatorId }));
    flashDevice();
  });

  populate(loadCfg());
  renderEntities();
  populateDevice();
  gateInit();
  initAdminTabs();
  initCollapsibleSections();

  function initAdminTabs() {
    const KEY = "prod.admin.activeTab.v1";
    const DEFAULT_TAB = "resumen";
    const tabs   = document.querySelectorAll(".admin-tab");
    const panels = document.querySelectorAll(".admin-panel");
    if (!tabs.length || !panels.length) return;
    let active = DEFAULT_TAB;
    try { active = localStorage.getItem(KEY) || DEFAULT_TAB; } catch (_) {}
    if (!document.querySelector('[data-panel="' + active + '"]')) active = DEFAULT_TAB;

    function activate(name) {
      active = name;
      tabs.forEach((t) => {
        const on = t.dataset.tab === name;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", String(on));
      });
      panels.forEach((p) => {
        p.classList.toggle("active", p.dataset.panel === name);
      });
      try { localStorage.setItem(KEY, name); } catch (_) {}
    }
    tabs.forEach((t) => t.addEventListener("click", () => activate(t.dataset.tab)));
    activate(active);
  }

  function initCollapsibleSections() {
    const KEY = "prod.admin.collapsed.v1";
    let state = {};
    try { state = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (_) {}
    const cards = document.querySelectorAll(".admin .admin-card");
    cards.forEach((card, idx) => {
      const h2 = card.querySelector(":scope > h2");
      if (!h2 || h2.dataset.collapsibleBound === "1") return;
      h2.dataset.collapsibleBound = "1";
      const label = h2.textContent.trim();
      const key = label || ("card-" + idx);
      const chevron = document.createElement("span");
      chevron.className = "admin-card-chevron";
      chevron.setAttribute("aria-hidden", "true");
      chevron.textContent = "▾";
      h2.appendChild(chevron);
      h2.setAttribute("role", "button");
      h2.setAttribute("tabindex", "0");
      function set(collapsed) {
        card.dataset.collapsed = collapsed ? "true" : "false";
        h2.setAttribute("aria-expanded", String(!collapsed));
        state[key] = !!collapsed;
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
      }
      // Default to collapsed for first-time visitors. Per-card persistence
      // overrides whenever the user has explicitly toggled the section.
      set(state.hasOwnProperty(key) ? !!state[key] : true);
      function toggle() { set(card.dataset.collapsed !== "true"); }
      h2.addEventListener("click", toggle);
      h2.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
  }

  window.addEventListener("languagechange", () => {
    renderEntities();
  });

  if (window.i18n && window.i18n.bindToggle) {
    window.i18n.bindToggle(document.getElementById("lang-toggle"));
  }
})();
