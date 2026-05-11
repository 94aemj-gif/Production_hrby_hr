(function () {
  "use strict";

  const STORAGE = {
    CONFIG: "prod.config.v1",
    SUBMISSIONS: "prod.submissions.v1",
    LAST_FIRED: "prod.lastFired.v1",
  };

  const DEFAULTS = {
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

  const form = document.getElementById("admin-form");
  const flash = document.getElementById("saved-flash");

  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE.CONFIG);
      return Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {});
    } catch (_) { return Object.assign({}, DEFAULTS); }
  };

  function populate(cfg) {
    form.elements.shiftLabel.value = cfg.shiftLabel;
    form.elements.shiftId.value = cfg.shiftId;
    form.elements.lineId.value = cfg.lineId;
    form.elements.operatorId.value = cfg.operatorId;
    form.elements.alertTimes.value = cfg.alertTimes.join(", ");
    form.elements.snoozeMinutes.value = cfg.snoozeMinutes;
    form.elements.hourlyTarget.value = cfg.hourlyTarget;
    form.elements.audioEnabled.value = cfg.audioEnabled ? "true" : "false";
    form.elements.audioVolume.value = cfg.audioVolume;
  }

  function parseTimes(raw) {
    return raw.split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .filter((t) => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t))
      .map((t) => {
        const [h, m] = t.split(":");
        return h.padStart(2, "0") + ":" + m;
      });
  }

  function showFlash() {
    flash.classList.add("show");
    setTimeout(() => flash.classList.remove("show"), 1600);
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const cfg = {
      shiftLabel: form.elements.shiftLabel.value.trim() || DEFAULTS.shiftLabel,
      shiftId: form.elements.shiftId.value.trim() || DEFAULTS.shiftId,
      lineId: form.elements.lineId.value.trim() || DEFAULTS.lineId,
      operatorId: form.elements.operatorId.value.trim() || DEFAULTS.operatorId,
      alertTimes: parseTimes(form.elements.alertTimes.value),
      snoozeMinutes: Math.max(1, Math.min(60, Number(form.elements.snoozeMinutes.value) || DEFAULTS.snoozeMinutes)),
      hourlyTarget: Math.max(0, Number(form.elements.hourlyTarget.value) || 0),
      audioEnabled: form.elements.audioEnabled.value === "true",
      audioVolume: Math.max(0, Math.min(1, Number(form.elements.audioVolume.value) || 0)),
    };
    if (!cfg.alertTimes.length) cfg.alertTimes = DEFAULTS.alertTimes.slice();
    localStorage.setItem(STORAGE.CONFIG, JSON.stringify(cfg));
    populate(cfg);
    showFlash();
  });

  document.getElementById("btn-reset").addEventListener("click", () => {
    localStorage.removeItem(STORAGE.CONFIG);
    populate(load());
    showFlash();
  });

  document.getElementById("btn-clear-data").addEventListener("click", () => {
    if (!confirm("Clear today's submissions and alert history? Counter is preserved.")) return;
    localStorage.removeItem(STORAGE.SUBMISSIONS);
    localStorage.removeItem(STORAGE.LAST_FIRED);
    showFlash();
  });

  populate(load());
})();
