/* seed.js — random-data seeder. Visit any page with `?seed=1` to wipe
 * localStorage and populate 14 days of demo sessions across 3 lines.
 * Runs synchronously before i18n/app/admin/dashboard so storage is ready
 * when those modules load.
 */
(function () {
  "use strict";

  var params = new URLSearchParams(location.search);
  if (params.get("seed") !== "1" && params.get("seed") !== "true") return;

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = mulberry32(20260517);

  function rng(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
  function pickWeighted(weights) {
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = rand() * total;
    for (var i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function dateISO(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function hourKey(h) { return pad(h) + ":00"; }

  function uuid() {
    return "seed-" + Math.floor(rand() * 1e16).toString(36) + "-" + Date.now().toString(36);
  }

  // --- Wipe all prod.*.v1 keys (and sync state) ---
  var keysToWipe = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.indexOf("prod.") === 0) keysToWipe.push(k);
  }
  keysToWipe.forEach(function (k) { localStorage.removeItem(k); });

  // --- Catalogs ---
  var LINES = [
    { id: "L-60ML", label: "#1 60ml Neomed Syringe" },
    { id: "L-35ML", label: "#2 35ml Neomed Syringe" },
    { id: "L-10ML", label: "#3 10ml Neomed Syringe" }
  ];
  var SHIFTS = [
    { id: "S1", label: "Turno 1", startTime: "06:00", endTime: "14:00", days: [0,1,2,3,4,5,6], breaks: [{start:"10:00",end:"10:15"}] },
    { id: "S2", label: "Turno 2", startTime: "14:00", endTime: "22:00", days: [0,1,2,3,4,5,6], breaks: [{start:"18:00",end:"18:15"}] }
  ];
  var OPERATORS = [
    { id: "12345", name: "Juan Pérez" },
    { id: "12378", name: "María López" },
    { id: "12401", name: "Carlos Ruiz" },
    { id: "13502", name: "Ana Torres" },
    { id: "13608", name: "Luis Méndez" },
    { id: "13755", name: "Sofía Vega" },
    { id: "14012", name: "Pedro Solís" },
    { id: "14188", name: "Elena Cruz" }
  ];
  var CONFIG = {
    alertTimes: ["09:00", "12:00", "15:00", "18:00"],
    snoozeMinutes: 5,
    hourlyTarget: 150,
    audioEnabled: true,
    audioVolume: 0.6
  };
  var DEVICE = { lineId: "L-60ML", operatorId: "12378" };

  var DOWNTIME_REASONS = [
    "Junta de producción", "Capacitación", "Cambio de material",
    "Limpieza", "Falta de material", "Otro"
  ];
  var SCRAP_REASONS = [
    "Pistón roto", "Empaque defectuoso", "Calidad fuera de spec", "Otro"
  ];

  localStorage.setItem("prod.lines.v1", JSON.stringify(LINES));
  localStorage.setItem("prod.shifts.v1", JSON.stringify(SHIFTS));
  localStorage.setItem("prod.operators.v1", JSON.stringify(OPERATORS));
  localStorage.setItem("prod.config.v1", JSON.stringify(CONFIG));
  localStorage.setItem("prod.device.v1", JSON.stringify(DEVICE));
  localStorage.setItem("prod.downtime.reasons.v1", JSON.stringify(DOWNTIME_REASONS));
  localStorage.setItem("prod.scrap.reasons.v1", JSON.stringify(SCRAP_REASONS));

  // --- Sessions: 14 days back, 2 shifts × 3 lines per day ---
  var sessions = [];
  var log = [];
  var now = new Date();
  var hourlyTarget = CONFIG.hourlyTarget;

  var lineProfile = {
    "L-60ML": { paceMean: 0.95, paceStd: 0.10, scrapRate: 0.014 },
    "L-35ML": { paceMean: 0.88, paceStd: 0.12, scrapRate: 0.020 },
    "L-10ML": { paceMean: 0.76, paceStd: 0.14, scrapRate: 0.030 }
  };

  var opsByLine = {
    "L-60ML": ["12378", "13608", "14188"],
    "L-35ML": ["12345", "13502", "14012"],
    "L-10ML": ["12401", "13755"]
  };

  for (var dOffset = 13; dOffset >= 0; dOffset--) {
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dOffset);
    var dow = d.getDay();
    var dateStr = dateISO(d);

    // Skip Sundays for L-03 sometimes
    LINES.forEach(function (line) {
      SHIFTS.forEach(function (shift) {
        if (dow === 0 && line.id === "L-10ML" && rand() < 0.6) return; // skip
        var ops = opsByLine[line.id] || ["12345"];
        var operatorId = ops[Math.floor(rand() * ops.length)];

        var sH = parseInt(shift.startTime.split(":")[0], 10);
        var eH = parseInt(shift.endTime.split(":")[0], 10);
        var hours = eH - sH;
        if (hours <= 0) hours = 8;

        var startedAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), sH, 0, 0);
        var endedAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), eH, 0, 0);

        // For today, mid-shift (so app shows live data)
        var isToday = dOffset === 0;
        var finalH = hours;
        if (isToday) {
          var nowH = now.getHours();
          if (nowH >= sH && nowH < eH) finalH = nowH - sH + 1;
          else if (nowH < sH) return; // shift hasn't started
          else finalH = hours;
        }

        var profile = lineProfile[line.id];
        var captures = [];
        var hourly = {};
        var goodCount = 0;
        var scrapCount = 0;
        var downtime = [];
        var submissions = [];

        for (var h = 0; h < finalH; h++) {
          var actualHour = sH + h;
          var hk = hourKey(actualHour);
          // Pace this hour
          var paceFactor = profile.paceMean + (rand() - 0.5) * 2 * profile.paceStd;
          if (rand() < 0.05) paceFactor *= 0.4; // occasional bad hour
          if (paceFactor < 0.2) paceFactor = 0.2;
          if (paceFactor > 1.4) paceFactor = 1.4;
          var qty = Math.round(hourlyTarget * paceFactor);
          hourly[hk] = qty;
          goodCount += qty;

          var ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), actualHour, 45, 0).toISOString();
          captures.push({
            id: uuid(), ts: ts, qty: qty, kind: "good",
            employeeId: operatorId, forHour: hk
          });

          // Scrap: probabilistic
          var sQty = 0;
          if (rand() < profile.scrapRate * 20) {
            sQty = rng(1, Math.max(2, Math.round(qty * 0.05)));
            scrapCount += sQty;
            captures.push({
              id: uuid(), ts: ts, qty: sQty, kind: "scrap",
              employeeId: operatorId, forHour: hk,
              notes: [SCRAP_REASONS[Math.floor(rand() * SCRAP_REASONS.length)]]
            });
          }

          // Downtime: rare
          if (rand() < 0.08) {
            var dur = rng(5, 25);
            var startTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), actualHour, 50 - dur, 0).toISOString();
            downtime.push({
              id: uuid(),
              start: startTs,
              end: ts,
              status: "Manual",
              reason: DOWNTIME_REASONS[Math.floor(rand() * DOWNTIME_REASONS.length)],
              durationMs: dur * 60000
            });
          }

          submissions.push({
            timestamp: ts, alertTime: hk, shiftId: shift.id, lineId: line.id,
            employeeId: operatorId, productionCount: qty, scrapCount: sQty
          });
        }

        var session = {
          date: dateStr,
          lineId: line.id,
          shiftId: shift.id,
          operatorId: operatorId,
          startedAt: startedAt.toISOString(),
          endedAt: (isToday && finalH < hours) ? null : endedAt.toISOString(),
          goodCount: goodCount,
          scrapCount: scrapCount,
          hourValue: 0,
          hourStart: hourKey(sH),
          hourly: hourly,
          captures: captures,
          submissions: submissions,
          downtime: downtime,
          currentStatus: (isToday && finalH < hours) ? "Running" : "Idle",
          alertTimes: ["09:00", "12:00", "15:00", "18:00"],
          updatedAt: new Date().toISOString()
        };
        sessions.push(session);

        // Log entries (sample)
        if (dOffset <= 2) {
          captures.slice(0, Math.min(captures.length, 6)).forEach(function (c) {
            log.push({
              id: c.id,
              ts: c.ts,
              type: c.kind === "scrap" ? "scrap" : "capture",
              msg: (c.kind === "scrap" ? "Rechazo " : "Captura ") + c.qty + " pzs · " + line.id + " · " + operatorId,
              employeeId: operatorId
            });
          });
        }
      });
    });
  }

  localStorage.setItem("prod.sessions.v1", JSON.stringify(sessions));
  localStorage.setItem("prod.log.v1", JSON.stringify(log));

  // Strip seed param from URL
  try {
    params.delete("seed");
    var qs = params.toString();
    var newUrl = location.pathname + (qs ? "?" + qs : "") + location.hash;
    history.replaceState(null, "", newUrl);
  } catch (e) {}

  // Reload once so app modules pick up fresh storage cleanly.
  // Use sessionStorage flag to avoid loop if reload re-triggers a stray ?seed.
  if (!sessionStorage.getItem("seedReloaded")) {
    sessionStorage.setItem("seedReloaded", "1");
    location.reload();
  } else {
    sessionStorage.removeItem("seedReloaded");
  }
})();
