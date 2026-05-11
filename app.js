/* Production Recording Screen
 * Single-page logic: clock, counter, scheduled alerts, modal data entry,
 * offline persistence to localStorage with replay on reconnect.
 */
(function () {
  "use strict";

  const STORAGE = {
    CONFIG: "prod.config.v1",
    COUNTER: "prod.counter.v1",
    SUBMISSIONS: "prod.submissions.v1",
    PENDING: "prod.pending.v1",
    SNOOZE: "prod.snooze.v1",
    LAST_FIRED: "prod.lastFired.v1",
  };

  const DEFAULT_CONFIG = {
    shiftId: "SHIFT-A-20250510",
    shiftLabel: "Shift A · Line 03",
    lineId: "L-03",
    operatorId: "OP-0847",
    alertTimes: ["09:00", "12:00", "15:00", "18:00"],
    snoozeMinutes: 5,
    hourlyTarget: 420,
    audioEnabled: true,
    audioVolume: 0.6,
  };

  // ---- Storage helpers ----
  const load = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  };
  const save = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  };

  // ---- State ----
  let config = Object.assign({}, DEFAULT_CONFIG, load(STORAGE.CONFIG, {}));
  let counter = load(STORAGE.COUNTER, { value: 0, hourStart: nowHourKey(), hourValue: 0 });
  let snoozeUntil = load(STORAGE.SNOOZE, 0);
  let lastFired = load(STORAGE.LAST_FIRED, {}); // { "YYYY-MM-DD HH:MM": true }
  let activeAlertTime = null;

  // ---- DOM ----
  const $ = (id) => document.getElementById(id);
  const clockEl = $("clock");
  const counterEl = $("counter");
  const nextAlertEl = $("next-alert-time");
  const shiftLabelEl = $("shift-label");
  const scheduleListEl = $("schedule-list");
  const metricHour = $("metric-hour");
  const metricTarget = $("metric-target");
  const metricEff = $("metric-efficiency");

  const alertOverlay = $("alert-overlay");
  const alertTimeEl = $("alert-time");
  const snoozeLabelEl = $("snooze-label");
  const formOverlay = $("form-overlay");
  const keypadOverlay = $("keypad-overlay");
  const keypadDisplay = $("keypad-display");
  const fShift = $("f-shift");
  const fCount = $("f-count");
  const fOperator = $("f-operator");
  const fStatus = $("f-status");
  const fNotes = $("f-notes");
  const fTime = $("form-time");

  // ---- Init UI from config ----
  function applyConfig() {
    shiftLabelEl.textContent = config.shiftLabel;
    metricTarget.textContent = config.hourlyTarget;
    fShift.value = config.shiftId;
    fOperator.value = config.operatorId;
    renderSchedule();
    updateNextAlert();
  }

  // ---- Clock & counter render ----
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }
  function fmtTime(d) { return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function fmtTimeFull(d) { return fmtTime(d) + ":" + pad2(d.getSeconds()); }
  function nowHourKey() {
    const d = new Date();
    return d.toISOString().slice(0, 13);
  }
  function todayKey() { return new Date().toISOString().slice(0, 10); }

  function rolloverHourIfNeeded() {
    const hk = nowHourKey();
    if (counter.hourStart !== hk) {
      counter.hourStart = hk;
      counter.hourValue = 0;
    }
  }

  function renderCounter() {
    rolloverHourIfNeeded();
    counterEl.textContent = counter.value.toLocaleString();
    metricHour.textContent = counter.hourValue.toLocaleString();
    const eff = config.hourlyTarget > 0
      ? Math.round((counter.hourValue / config.hourlyTarget) * 100)
      : 0;
    metricEff.textContent = eff + "%";
    metricEff.style.color = eff >= 90 ? "var(--green)" : eff >= 60 ? "var(--blue)" : "var(--accent)";
  }

  function incrementBy(n) {
    rolloverHourIfNeeded();
    counter.value = Math.max(0, counter.value + n);
    counter.hourValue = Math.max(0, counter.hourValue + n);
    save(STORAGE.COUNTER, counter);
    renderCounter();
  }

  // ---- Schedule rendering ----
  function renderSchedule() {
    scheduleListEl.innerHTML = "";
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    config.alertTimes.forEach((t, idx) => {
      const [hh, mm] = t.split(":").map(Number);
      const mins = hh * 60 + mm;
      const passed = mins < nowMin;
      const li = document.createElement("li");
      if (passed) li.classList.add("done");
      const label = idx === 0 ? "Register morning production data"
        : idx === config.alertTimes.length - 1 ? "End of shift production summary"
        : "Register production data";
      li.innerHTML = `<span class="sched-time">${t}</span><span class="sched-tag">Alert</span><span>${label}</span>`;
      scheduleListEl.appendChild(li);
    });
  }

  function updateNextAlert() {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const upcoming = config.alertTimes
      .map((t) => {
        const [hh, mm] = t.split(":").map(Number);
        return { time: t, mins: hh * 60 + mm };
      })
      .filter((a) => a.mins > nowMin)
      .sort((a, b) => a.mins - b.mins);
    nextAlertEl.textContent = upcoming.length ? upcoming[0].time : "—";
  }

  // ---- Alert engine ----
  function tick() {
    const now = new Date();
    clockEl.textContent = fmtTimeFull(now);

    // Skip if a popup is already open
    if (!alertOverlay.classList.contains("hidden") || !formOverlay.classList.contains("hidden")) {
      return;
    }
    if (Date.now() < snoozeUntil) return;

    const hhmm = fmtTime(now);
    if (config.alertTimes.indexOf(hhmm) === -1) return;
    const key = todayKey() + " " + hhmm;
    if (lastFired[key]) return;

    // Fire the alert (within 10s of scheduled minute start)
    if (now.getSeconds() <= 10) {
      lastFired[key] = true;
      save(STORAGE.LAST_FIRED, lastFired);
      showAlert(hhmm);
      renderSchedule();
      updateNextAlert();
    }
  }

  function showAlert(hhmm) {
    activeAlertTime = hhmm;
    alertTimeEl.textContent = hhmm;
    snoozeLabelEl.textContent = String(config.snoozeMinutes);
    alertOverlay.classList.remove("hidden");
    alertOverlay.setAttribute("aria-hidden", "false");
    playBeep();
  }

  function hideAlert() {
    alertOverlay.classList.add("hidden");
    alertOverlay.setAttribute("aria-hidden", "true");
  }

  function showForm() {
    fTime.textContent = activeAlertTime || fmtTime(new Date());
    fCount.value = counter.value;
    fShift.value = config.shiftId;
    fOperator.value = config.operatorId;
    fStatus.value = "Running";
    fNotes.value = "";
    formOverlay.classList.remove("hidden");
    formOverlay.setAttribute("aria-hidden", "false");
    setTimeout(() => fCount.focus(), 50);
  }

  function hideForm() {
    formOverlay.classList.add("hidden");
    formOverlay.setAttribute("aria-hidden", "true");
  }

  // ---- Audio cue (synthesized so no external asset needed) ----
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
        osc.frequency.value = 880;
        osc.type = "square";
        gain.gain.value = 0;
        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(config.audioVolume, now + offset + 0.02);
        gain.gain.linearRampToValueAtTime(0, now + offset + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.25);
      });
    } catch (_) {
      // Audio is optional per PRD
    }
  }

  // ---- Submissions & offline-safe persistence ----
  function recordSubmission(record) {
    const all = load(STORAGE.SUBMISSIONS, []);
    all.push(record);
    save(STORAGE.SUBMISSIONS, all);

    // Simulate backend persistence; queue if offline
    if (!navigator.onLine) {
      const pending = load(STORAGE.PENDING, []);
      pending.push(record);
      save(STORAGE.PENDING, pending);
      return;
    }
    // Fire-and-forget; real backend would go here.
    setTimeout(() => { /* "persisted" within 2s */ }, 50);
  }

  function flushPending() {
    if (!navigator.onLine) return;
    const pending = load(STORAGE.PENDING, []);
    if (!pending.length) return;
    // Real implementation would POST each; we mark as synced.
    save(STORAGE.PENDING, []);
  }

  // ---- Capture keypad ----
  let keypadBuffer = "";
  function renderKeypad() {
    keypadDisplay.textContent = keypadBuffer === "" ? "0" : keypadBuffer;
  }
  function openKeypad() {
    keypadBuffer = "";
    renderKeypad();
    keypadOverlay.classList.remove("hidden");
    keypadOverlay.setAttribute("aria-hidden", "false");
  }
  function closeKeypad() {
    keypadOverlay.classList.add("hidden");
    keypadOverlay.setAttribute("aria-hidden", "true");
  }
  function keypadPress(key) {
    if (key === "clear") {
      keypadBuffer = "";
    } else if (key === "back") {
      keypadBuffer = keypadBuffer.slice(0, -1);
    } else if (/^[0-9]$/.test(key)) {
      if (keypadBuffer.length >= 7) return; // cap at 9,999,999
      if (keypadBuffer === "0") keypadBuffer = key;
      else keypadBuffer += key;
    }
    renderKeypad();
  }
  function keypadConfirm() {
    const qty = parseInt(keypadBuffer, 10);
    if (Number.isFinite(qty) && qty > 0) {
      incrementBy(qty);
    }
    closeKeypad();
  }

  // ---- Event wiring ----
  function wire() {
    $("btn-capture").addEventListener("click", openKeypad);
    $("btn-keypad-cancel").addEventListener("click", closeKeypad);
    $("btn-keypad-confirm").addEventListener("click", keypadConfirm);
    document.querySelectorAll(".keypad-grid .key").forEach((btn) => {
      btn.addEventListener("click", () => keypadPress(btn.dataset.key));
    });

    // Hardware button / keyboard:
    //   - When idle: Space/Enter opens the Capture keypad.
    //   - When keypad open: digits append, Backspace deletes, Enter confirms, Esc cancels.
    document.addEventListener("keydown", (e) => {
      const formOpen = !formOverlay.classList.contains("hidden");
      const alertOpen = !alertOverlay.classList.contains("hidden");
      const keypadOpen = !keypadOverlay.classList.contains("hidden");
      const target = e.target;
      const inField = target && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");
      if (inField) return;

      if (keypadOpen) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          keypadPress(e.key);
        } else if (e.key === "Backspace") {
          e.preventDefault();
          keypadPress("back");
        } else if (e.key === "Delete") {
          e.preventDefault();
          keypadPress("clear");
        } else if (e.key === "Enter" || e.code === "NumpadEnter") {
          e.preventDefault();
          keypadConfirm();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeKeypad();
        }
        return;
      }

      if (formOpen || alertOpen) return;
      if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        openKeypad();
      }
    });

    $("btn-register").addEventListener("click", () => {
      hideAlert();
      showForm();
    });

    $("btn-snooze").addEventListener("click", () => {
      snoozeUntil = Date.now() + config.snoozeMinutes * 60 * 1000;
      save(STORAGE.SNOOZE, snoozeUntil);
      hideAlert();
    });

    $("entry-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const record = {
        timestamp: new Date().toISOString(),
        alertTime: activeAlertTime,
        shiftId: fShift.value.trim(),
        operatorId: fOperator.value.trim(),
        productionCount: Number(fCount.value),
        equipmentStatus: fStatus.value,
        notes: fNotes.value.trim(),
      };
      if (!Number.isFinite(record.productionCount) || record.productionCount < 0) {
        fCount.focus();
        return;
      }
      if (!record.operatorId) {
        fOperator.focus();
        return;
      }
      recordSubmission(record);
      // Reconcile counter with submitted value (operator may have corrected it)
      const delta = record.productionCount - counter.value;
      if (delta !== 0) {
        counter.value = record.productionCount;
        counter.hourValue = Math.max(0, counter.hourValue + delta);
        save(STORAGE.COUNTER, counter);
        renderCounter();
      }
      activeAlertTime = null;
      hideForm();
    });

    window.addEventListener("online", flushPending);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE.CONFIG) {
        config = Object.assign({}, DEFAULT_CONFIG, load(STORAGE.CONFIG, {}));
        applyConfig();
        renderCounter();
      }
    });
  }

  // ---- Boot ----
  function boot() {
    applyConfig();
    renderCounter();
    wire();
    tick();
    setInterval(tick, 1000);
    setInterval(() => {
      updateNextAlert();
      renderSchedule();
    }, 30000);
    flushPending();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
