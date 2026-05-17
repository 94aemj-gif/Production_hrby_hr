/* Lightweight i18n for ES/EN.
 * Shared between index.html and admin.html. Loaded before app.js / admin.js.
 * Exposes window.i18n.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "prod.lang.v1";
  const DEFAULT_LANG = "es";

  const DICT = {
    es: {
      // Page titles
      "page.title.capture": "Registro de Producción",
      "page.title.admin": "Configuración Admin",

      // Sidebar / nav
      "nav.capture": "Captura",
      "nav.charts": "Gráficas",

      // Top bar
      "top.status": "Estado",
      "top.statusOpt.running": "En operación",
      "top.statusOpt.idle": "Inactivo",
      "top.statusOpt.maintenance": "Mantenimiento",
      "top.statusOpt.breakdown": "Avería",
      "top.nextAlert": "Próxima alerta",
      "top.admin": "Admin",
      "top.lang.toLabel": "EN",
      "top.lang.title": "English",

      "sync.ok": "✓ Sync",
      "sync.okTitle": "Sincronizado · última: {when}",
      "sync.pending": "⟳ {n}",
      "sync.pendingTitle": "Sincronizando… toque para reintentar.",
      "sync.error": "⚠ {n}",
      "sync.errorTitle": "Error al sincronizar. Toque para reintentar.",
      "sync.off": "○ Local",
      "sync.offTitle": "Sin conexión a base de datos. Los datos sólo viven en este dispositivo.",

      // Status pill
      "status.active": "Activo",
      "status.idle": "Inactivo",
      "status.maintenance": "Mantenimiento",
      "status.breakdown": "Avería",
      "status.outOfShift": "Fuera de Turno",

      // Counter card
      "counter.cardLabel": "Producción del Turno (Piezas)",
      "counter.tapToStart": "Toque CAPTURAR para iniciar",
      "counter.lastShort": "Última:",
      "counter.currentHourLabel": "Hora actual",
      "counter.outOfShift": "Fuera de turno",
      "counter.minToCapture": "{n} min para capturar",
      "counter.hourRange": "Hora {h1}:00 {ap1} – {h2}:00 {ap2}",
      "counter.lastCapture.scrap": "Emp {emp} · {qty} rechazos · {time}",
      "counter.lastCapture.good": "Emp {emp} · +{qty} piezas · {time}",

      // Buttons
      "btn.capture": "Capturar",
      "btn.captureAria": "Capturar producción",
      "btn.undo": "Deshacer",
      "btn.undoAria": "Deshacer última captura",
      "btn.undoCountdown": "Deshacer ({s}s)",
      "btn.cancel": "Cancelar",
      "btn.done": "Listo",
      "btn.save": "Guardar",
      "btn.enter": "Entrar",
      "btn.register": "Registrar Datos",
      "btn.snooze": "Posponer {n} min",

      // Metrics
      "metric.lastHour": "Última Hora",
      "metric.targetHour": "Meta por Hora",
      "metric.shiftScrap": "Rechazos del Turno",
      "metric.hrComplete": "{n} hr completa",
      "metric.hrsComplete": "{n} hrs completas",

      // Chart card
      "chart.hourlyTrend": "Tendencia por Hora",
      "charts.title": "Gráficas en Vivo",
      "charts.hourlyVsTarget": "Producción por Hora vs Meta",
      "charts.cumulativeVsTarget": "Acumulado del Turno vs Meta Acumulada",
      "charts.scrapByHour": "Rechazos por Hora",
      "charts.noData": "Sin datos aún",
      "charts.noEmployees": "Sin capturas con empleado aún",
      "charts.legend": "─ real  · · · meta",

      // KPI
      "kpi.oee": "OEE",
      "kpi.availability": "Disponibilidad",
      "kpi.performance": "Rendimiento",
      "kpi.quality": "Calidad",

      // Log section
      "log.title": "Bitácora de Capturas",
      "log.empty": "Sin movimientos registrados.",
      "log.noMatches": "Sin coincidencias.",
      "log.delTitle": "Eliminar captura",
      "log.delConfirm": "¿Eliminar?\n\n{time} — {msg}",

      // Log tag labels
      "logTag.capture": "Captura",
      "logTag.scrap": "Rechazo",
      "logTag.alert": "Alerta",
      "logTag.snooze": "Posponer",
      "logTag.submit": "Envío",
      "logTag.adjust": "Ajuste",
      "logTag.config": "Config",
      "logTag.clear": "Limpieza",
      "logTag.system": "Sistema",
      "logTag.downtime": "Paro",
      "logTag.status": "Estado",
      "logTag.session": "Sesión",
      "logTag.undo": "Deshacer",

      // Alert popup
      "alert.title": "Registro de Producción",
      "alert.body": "Por favor registre sus datos de producción antes de continuar. Esto asegura registros precisos del turno.",

      // Capture form
      "form.title": "Capturar Producción",
      "form.subtle": "Escanee su número de empleado y registre la cantidad.",
      "form.empNum": "# de Empleado",
      "form.capturedHour": "Hora Capturada",
      "form.qty": "Cantidad Producida (Piezas) *",
      "form.scrap": "Rechazos (opcional)",
      "form.notes": "Notas",
      "form.hourOpt": "{h1}:00 {ap1} – {h2}:00 {ap2}",
      "form.hourOptCaptured": "{h1}:00 {ap1} – {h2}:00 {ap2}  (ya capturado: {n})",
      "form.noHours": "Sin horas disponibles",
      "form.confirmCancel": "¿Cancelar captura sin guardar?",
      "form.outOfShift": "Fuera del horario del turno ({start} – {end}). ¿Registrar de todas formas?",
      "form.outOfShiftSimple": "Fuera del horario del turno. ¿Registrar de todas formas?",

      // Notes presets
      "notes.training": "Personal entrenamiento",
      "notes.meeting": "Junta producción",
      "notes.noMaterial": "Falta material",

      // Numpad
      "numpad.enterQty": "Ingrese cantidad",
      "numpad.backAria": "Retroceso",

      // Admin gate (popup on index)
      "gate.title": "Acceso Admin",
      "gate.subtle": "Ingrese contraseña para continuar.",
      "gate.password": "Contraseña",
      "gate.wrong": "Contraseña incorrecta.",

      // EOS
      "eos.title": "Resumen de Turno",
      "eos.production": "Producción",
      "eos.scrap": "Rechazos",
      "eos.oee": "OEE",
      "eos.totalDown": "Paro Total",
      "eos.min": "{n} min",
      "eos.exportCsv": "Exportar CSV",
      "eos.closeShift": "Cerrar Turno",

      // Toasts / dynamic
      "toast.registered": "✓ Registrado +{qty} piezas — Emp {emp}",
      "log.captureMsg": "Captura: +{qty} piezas (total {total})",
      "log.scrapMsg": "Rechazos: +{qty} (total {total})",
      "charts.noSession": "Sin sesión para esa fecha.",
      "charts.heatmap": "Mapa de Calor — Producción por Hora (14 días)",
      "charts.heatmapLegendLess": "menos",
      "charts.heatmapLegendMore": "más",
      "eos.bannerWin": "¡Meta cumplida!  Bien hecho.",
      "eos.bannerClose": "Casi — muy cerca de la meta",
      "eos.bannerMiss": "Turno cerrado",
      "log.captureRemote": "Captura (otra tablet): +{qty} piezas",
      "log.scrapRemote": "Rechazos (otra tablet): +{qty}",
      "log.undoRemote": "Captura deshecha (otra tablet)",
      "log.adminDelRemote": "Admin eliminó captura (otra tablet)",
      "log.undoMsgScrap": "Captura deshecha: -{qty} (rechazos)",
      "log.undoMsgPieces": "Captura deshecha: -{qty} (piezas)",
      "log.adminDelScrap": "Admin eliminó captura: -{qty} (rechazos)",
      "log.adminDelPieces": "Admin eliminó captura: -{qty} (piezas)",
      "log.statusChanged": "Estado cambiado a: {status}",
      "log.downStarted": "Paro iniciado: {status}",
      "log.downEnded": "Paro terminado: {status} ({mins} min)",
      "log.captureFull": "Emp {emp}: +{qty} piezas{scrap}{notes}",
      "log.captureScrapPart": ", {n} rechazos",
      "log.captureNotePart": " · {notes}",
      "log.alertFired": "Alerta disparada para {time}",
      "log.snoozed": "Alerta pospuesta {n} min",
      "log.sessionStarted": "Sesión iniciada (auto): {line} · {shift} · {operator}",
      "log.flushed": "Envíos pendientes sincronizados: {n}",
      "log.exportedCSV": "Exportado CSV: {date}",
      "log.exportedAllCSV": "Exportado CSV completo ({n} sesiones)",
      "log.clearedManual": "Bitácora limpiada manualmente",
      "log.confirmClear": "¿Limpiar la bitácora de movimientos?",

      // Schedule
      "sched.first": "Primer registro horario",
      "sched.last": "Resumen de fin de turno",
      "sched.regular": "Registrar producción de la hora",
      "sched.tag": "Alerta",
      "sched.in": "en {n} min",

      // Shift label
      "shift.noActive": "Sin turno activo",
      "shift.configDevice": "Configure dispositivo en Admin",
      "shift.overtime": "Tiempo Extra",

      // History (capture screen)
      "history.empty": "Sin sesiones para esta fecha.",
      "history.production": "Producción",
      "history.scrap": "Rechazos",
      "history.oee": "OEE",
      "history.down": "Paro",
      "history.submissions": "Envíos",
      "history.min": "{n} min",

      // ---- Admin page ----
      "admin.title": "Configuración Admin",
      "admin.back": "← Volver a Pantalla de Producción",
      "admin.lock": "Cerrar Admin",
      "admin.lock.title": "Acceso Admin",
      "admin.lock.subtle": "Ingrese contraseña para acceder.",

      "admin.security": "Seguridad",
      "admin.newPwd": "Nueva Contraseña Admin",
      "admin.changePwd": "Cambiar Contraseña",
      "admin.changed": "Cambiada.",
      "admin.pwdTooShort": "Contraseña debe tener al menos 3 caracteres",
      "admin.log.pwdChanged": "Contraseña admin cambiada",

      "admin.device": "Dispositivo",
      "admin.device.note": "Línea y operador asignados a este dispositivo. El turno se detecta automáticamente por la hora.",
      "admin.device.line": "Línea Predeterminada",
      "admin.device.op": "Operador Predeterminado",
      "admin.device.save": "Guardar Dispositivo",
      "admin.device.saved": "Guardado.",

      "admin.params": "Parámetros de Producción",
      "admin.params.note": "Las alertas se disparan cada hora dentro del rango del turno automáticamente.",
      "admin.snoozeDur": "Duración de Posponer (minutos)",
      "admin.hourlyTarget": "Meta por Hora (piezas)",
      "admin.audio": "Alerta de Audio",
      "admin.audio.enable": "Habilitar Audio",
      "admin.audio.vol": "Volumen (0.0 – 1.0)",
      "admin.audio.on": "Habilitado",
      "admin.audio.off": "Deshabilitado",
      "admin.btn.saveCfg": "Guardar Configuración",
      "admin.btn.reset": "Restablecer Valores",
      "admin.btn.saved": "Guardado.",

      "admin.lines": "Líneas de Producción",
      "admin.col.id": "ID",
      "admin.col.label": "Etiqueta",
      "admin.col.start": "Inicio",
      "admin.col.end": "Fin",
      "admin.col.days": "Días",
      "admin.col.breaks": "Recesos",
      "admin.col.name": "Nombre",
      "admin.ph.lineId": "ID (ej. L-04)",
      "admin.ph.lineLabel": "Etiqueta",
      "admin.btn.add": "Agregar",

      "admin.shifts": "Turnos",
      "admin.shifts.note": "El sistema genera alertas cada hora dentro del rango del turno. Hora fin menor que hora inicio = cruza medianoche.",
      "admin.ph.shiftId": "ID (ej. S3)",
      "admin.ph.shiftLabel": "Etiqueta",
      "admin.ph.shiftDays": "Días (ej. 1,2,3,4)",
      "admin.shifts.daysLegend": "Días: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb",

      "admin.operators": "Operadores",
      "admin.ph.opId": "ID (ej. OP-1001)",
      "admin.ph.opName": "Nombre",

      "admin.history": "Historial de Sesiones",
      "admin.history.date": "Fecha",
      "admin.history.exportDay": "Exportar Día",
      "admin.history.exportAll": "Exportar Todo",

      "admin.movLog": "Bitácora de Movimientos",
      "admin.search": "Buscar...",
      "admin.filter.all": "Todos",
      "admin.filter.capture": "Captura",
      "admin.filter.scrap": "Rechazo",
      "admin.filter.alert": "Alerta",
      "admin.filter.submit": "Envío",
      "admin.filter.downtime": "Paro",
      "admin.filter.status": "Estado",
      "admin.filter.session": "Sesión",
      "admin.clearLog": "Limpiar Bitácora",

      "admin.data": "Datos",
      "admin.clearToday": "Limpiar Envíos y Alertas de Hoy",
      "admin.clearSessions": "Borrar Todas las Sesiones",
      "admin.confirmClearToday": "¿Limpiar envíos de hoy e historial de alertas?",
      "admin.confirmClearSessions": "¿Borrar TODAS las sesiones históricas? Acción irreversible.",
      "admin.resetTodayCloud": "Reset Día Actual (Supabase + local)",
      "admin.resetTodayCloudBusy": "Borrando...",
      "admin.confirmResetTodayCloud": "¿Borrar TODOS los datos de hoy ({date}) en Supabase y en este dispositivo?\n\n• Capturas, paros y eventos del día\n• Sesiones y bitácora locales\n\nAcción irreversible.",
      "admin.resetTodayCloudPartial": "Supabase devolvió errores. Los datos locales se borraron de todas formas.",

      "admin.btn.edit": "✎ Editar",
      "admin.btn.delete": "Eliminar",
      "admin.btn.breaks": "Recesos",

      "admin.alert.idLabel": "ID y etiqueta requeridos",
      "admin.alert.idDup": "ID duplicado",
      "admin.alert.allReq": "Todos los campos requeridos",
      "admin.alert.timeFmt": "Formato hora inválido (HH:MM)",
      "admin.alert.idName": "ID y nombre requeridos",
      "admin.alert.allShift": "ID, etiqueta, inicio y fin requeridos",
      "admin.alert.timeHHMM": "Hora debe ser HH:MM",
      "admin.alert.breakReq": "Llene hora inicio y fin de cada receso",
      "admin.confirmDelLine": "¿Eliminar línea {id}?",
      "admin.confirmDelShift": "¿Eliminar turno {id}?",
      "admin.confirmDelOp": "¿Eliminar operador {id}?",

      "admin.log.cfgSaved": "Configuración guardada (meta {target})",
      "admin.log.cfgReset": "Configuración restablecida a valores por defecto",
      "admin.log.clearedToday": "Envíos de hoy e historial de alertas limpiados",
      "admin.log.clearedSessions": "Todas las sesiones borradas",
      "admin.log.resetTodayCloud": "Día {date} reseteado (Supabase + local)",
      "admin.log.resetTodayCloudPartial": "Día {date} reseteado en local; errores parciales en Supabase",
      "admin.log.lineAdded": "Línea agregada: {id} {label}",
      "admin.log.lineEdited": "Línea editada: {id} {label}",
      "admin.log.lineRemoved": "Línea eliminada: {id}",
      "admin.log.shiftAdded": "Turno agregado: {id} {label} ({start}–{end})",
      "admin.log.shiftEdited": "Turno editado: {id}",
      "admin.log.shiftRemoved": "Turno eliminado: {id}",
      "admin.log.opAdded": "Operador agregado: {id} {name}",
      "admin.log.opEdited": "Operador editado: {id} {name}",
      "admin.log.opRemoved": "Operador eliminado: {id}",
      "admin.log.breaksUpdated": "Recesos actualizados para {id}",
      "admin.log.device": "Dispositivo: línea {line}, operador {op}",

      "breaks.title": "Recesos del Turno",
      "breaks.add": "+ Agregar Receso",
      "breaks.empty": "Sin recesos.",

      // Days short
      "day.0": "Dom",
      "day.1": "Lun",
      "day.2": "Mar",
      "day.3": "Mié",
      "day.4": "Jue",
      "day.5": "Vie",
      "day.6": "Sáb",
    },

    en: {
      "page.title.capture": "Production Logging",
      "page.title.admin": "Admin Settings",

      "nav.capture": "Capture",
      "nav.charts": "Charts",

      "top.status": "Status",
      "top.statusOpt.running": "Running",
      "top.statusOpt.idle": "Idle",
      "top.statusOpt.maintenance": "Maintenance",
      "top.statusOpt.breakdown": "Breakdown",
      "top.nextAlert": "Next alert",
      "top.admin": "Admin",
      "top.lang.toLabel": "ES",
      "top.lang.title": "Español",

      "sync.ok": "✓ Sync",
      "sync.okTitle": "Synced · last: {when}",
      "sync.pending": "⟳ {n}",
      "sync.pendingTitle": "Syncing… tap to retry.",
      "sync.error": "⚠ {n}",
      "sync.errorTitle": "Sync error. Tap to retry.",
      "sync.off": "○ Local",
      "sync.offTitle": "No database connection. Data lives only on this device.",

      "status.active": "Active",
      "status.idle": "Idle",
      "status.maintenance": "Maintenance",
      "status.breakdown": "Breakdown",
      "status.outOfShift": "Off Shift",

      "counter.cardLabel": "Shift Production (Pieces)",
      "counter.tapToStart": "Tap CAPTURE to start",
      "counter.lastShort": "Last:",
      "counter.currentHourLabel": "Current hour",
      "counter.outOfShift": "Off shift",
      "counter.minToCapture": "{n} min to capture",
      "counter.hourRange": "Hour {h1}:00 {ap1} – {h2}:00 {ap2}",
      "counter.lastCapture.scrap": "Emp {emp} · {qty} scrap · {time}",
      "counter.lastCapture.good": "Emp {emp} · +{qty} pieces · {time}",

      "btn.capture": "Capture",
      "btn.captureAria": "Capture production",
      "btn.undo": "Undo",
      "btn.undoAria": "Undo last capture",
      "btn.undoCountdown": "Undo ({s}s)",
      "btn.cancel": "Cancel",
      "btn.done": "Done",
      "btn.save": "Save",
      "btn.enter": "Enter",
      "btn.register": "Register Data",
      "btn.snooze": "Snooze {n} min",

      "metric.lastHour": "Last Hour",
      "metric.targetHour": "Hourly Target",
      "metric.shiftScrap": "Shift Scrap",
      "metric.hrComplete": "{n} hr complete",
      "metric.hrsComplete": "{n} hrs complete",

      "chart.hourlyTrend": "Hourly Trend",
      "charts.title": "Live Charts",
      "charts.hourlyVsTarget": "Hourly Production vs Target",
      "charts.cumulativeVsTarget": "Shift Cumulative vs Cumulative Target",
      "charts.scrapByHour": "Scrap by Hour",
      "charts.noData": "No data yet",
      "charts.noEmployees": "No employee captures yet",
      "charts.legend": "─ actual  · · · target",

      "kpi.oee": "OEE",
      "kpi.availability": "Availability",
      "kpi.performance": "Performance",
      "kpi.quality": "Quality",

      "log.title": "Capture Log",
      "log.empty": "No movements recorded.",
      "log.noMatches": "No matches.",
      "log.delTitle": "Delete capture",
      "log.delConfirm": "Delete?\n\n{time} — {msg}",

      "logTag.capture": "Capture",
      "logTag.scrap": "Scrap",
      "logTag.alert": "Alert",
      "logTag.snooze": "Snooze",
      "logTag.submit": "Submit",
      "logTag.adjust": "Adjust",
      "logTag.config": "Config",
      "logTag.clear": "Clear",
      "logTag.system": "System",
      "logTag.downtime": "Downtime",
      "logTag.status": "Status",
      "logTag.session": "Session",
      "logTag.undo": "Undo",

      "alert.title": "Production Logging",
      "alert.body": "Please record your production data before continuing. This ensures accurate shift records.",

      "form.title": "Capture Production",
      "form.subtle": "Scan your employee number and record the quantity.",
      "form.empNum": "Employee #",
      "form.capturedHour": "Captured Hour",
      "form.qty": "Pieces Produced *",
      "form.scrap": "Scrap (optional)",
      "form.notes": "Notes",
      "form.hourOpt": "{h1}:00 {ap1} – {h2}:00 {ap2}",
      "form.hourOptCaptured": "{h1}:00 {ap1} – {h2}:00 {ap2}  (already: {n})",
      "form.noHours": "No hours available",
      "form.confirmCancel": "Cancel capture without saving?",
      "form.outOfShift": "Outside shift hours ({start} – {end}). Record anyway?",
      "form.outOfShiftSimple": "Outside shift hours. Record anyway?",

      "notes.training": "Training",
      "notes.meeting": "Production meeting",
      "notes.noMaterial": "No material",

      "numpad.enterQty": "Enter quantity",
      "numpad.backAria": "Backspace",

      "gate.title": "Admin Access",
      "gate.subtle": "Enter password to continue.",
      "gate.password": "Password",
      "gate.wrong": "Wrong password.",

      "eos.title": "Shift Summary",
      "eos.production": "Production",
      "eos.scrap": "Scrap",
      "eos.oee": "OEE",
      "eos.totalDown": "Total Downtime",
      "eos.min": "{n} min",
      "eos.exportCsv": "Export CSV",
      "eos.closeShift": "Close Shift",

      "toast.registered": "✓ Logged +{qty} pieces — Emp {emp}",
      "log.captureMsg": "Capture: +{qty} pieces (total {total})",
      "log.scrapMsg": "Scrap: +{qty} (total {total})",
      "charts.noSession": "No session for that date.",
      "charts.heatmap": "Heatmap — Hourly Production (14 days)",
      "charts.heatmapLegendLess": "less",
      "charts.heatmapLegendMore": "more",
      "eos.bannerWin": "Target hit!  Well done.",
      "eos.bannerClose": "Close — almost there",
      "eos.bannerMiss": "Shift closed",
      "log.captureRemote": "Capture (other tablet): +{qty} pieces",
      "log.scrapRemote": "Scrap (other tablet): +{qty}",
      "log.undoRemote": "Capture undone (other tablet)",
      "log.adminDelRemote": "Admin deleted capture (other tablet)",
      "log.undoMsgScrap": "Capture undone: -{qty} (scrap)",
      "log.undoMsgPieces": "Capture undone: -{qty} (pieces)",
      "log.adminDelScrap": "Admin deleted capture: -{qty} (scrap)",
      "log.adminDelPieces": "Admin deleted capture: -{qty} (pieces)",
      "log.statusChanged": "Status changed to: {status}",
      "log.downStarted": "Downtime started: {status}",
      "log.downEnded": "Downtime ended: {status} ({mins} min)",
      "log.captureFull": "Emp {emp}: +{qty} pieces{scrap}{notes}",
      "log.captureScrapPart": ", {n} scrap",
      "log.captureNotePart": " · {notes}",
      "log.alertFired": "Alert fired for {time}",
      "log.snoozed": "Alert snoozed {n} min",
      "log.sessionStarted": "Session started (auto): {line} · {shift} · {operator}",
      "log.flushed": "Pending submissions synced: {n}",
      "log.exportedCSV": "Exported CSV: {date}",
      "log.exportedAllCSV": "Exported full CSV ({n} sessions)",
      "log.clearedManual": "Log cleared manually",
      "log.confirmClear": "Clear movement log?",

      "sched.first": "First hourly entry",
      "sched.last": "End-of-shift summary",
      "sched.regular": "Record hourly production",
      "sched.tag": "Alert",
      "sched.in": "in {n} min",

      "shift.noActive": "No active shift",
      "shift.configDevice": "Configure device in Admin",
      "shift.overtime": "Overtime",

      "history.empty": "No sessions for this date.",
      "history.production": "Production",
      "history.scrap": "Scrap",
      "history.oee": "OEE",
      "history.down": "Downtime",
      "history.submissions": "Submissions",
      "history.min": "{n} min",

      "admin.title": "Admin Settings",
      "admin.back": "← Back to Production Screen",
      "admin.lock": "Lock Admin",
      "admin.lock.title": "Admin Access",
      "admin.lock.subtle": "Enter password to access.",

      "admin.security": "Security",
      "admin.newPwd": "New Admin Password",
      "admin.changePwd": "Change Password",
      "admin.changed": "Changed.",
      "admin.pwdTooShort": "Password must be at least 3 characters",
      "admin.log.pwdChanged": "Admin password changed",

      "admin.device": "Device",
      "admin.device.note": "Line and operator assigned to this device. Shift is detected automatically by time.",
      "admin.device.line": "Default Line",
      "admin.device.op": "Default Operator",
      "admin.device.save": "Save Device",
      "admin.device.saved": "Saved.",

      "admin.params": "Production Parameters",
      "admin.params.note": "Alerts fire every hour within the shift range automatically.",
      "admin.snoozeDur": "Snooze Duration (minutes)",
      "admin.hourlyTarget": "Hourly Target (pieces)",
      "admin.audio": "Audio Alert",
      "admin.audio.enable": "Enable Audio",
      "admin.audio.vol": "Volume (0.0 – 1.0)",
      "admin.audio.on": "Enabled",
      "admin.audio.off": "Disabled",
      "admin.btn.saveCfg": "Save Settings",
      "admin.btn.reset": "Reset Defaults",
      "admin.btn.saved": "Saved.",

      "admin.lines": "Production Lines",
      "admin.col.id": "ID",
      "admin.col.label": "Label",
      "admin.col.start": "Start",
      "admin.col.end": "End",
      "admin.col.days": "Days",
      "admin.col.breaks": "Breaks",
      "admin.col.name": "Name",
      "admin.ph.lineId": "ID (e.g. L-04)",
      "admin.ph.lineLabel": "Label",
      "admin.btn.add": "Add",

      "admin.shifts": "Shifts",
      "admin.shifts.note": "System generates alerts every hour within the shift range. End time before start time = crosses midnight.",
      "admin.ph.shiftId": "ID (e.g. S3)",
      "admin.ph.shiftLabel": "Label",
      "admin.ph.shiftDays": "Days (e.g. 1,2,3,4)",
      "admin.shifts.daysLegend": "Days: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat",

      "admin.operators": "Operators",
      "admin.ph.opId": "ID (e.g. OP-1001)",
      "admin.ph.opName": "Name",

      "admin.history": "Session History",
      "admin.history.date": "Date",
      "admin.history.exportDay": "Export Day",
      "admin.history.exportAll": "Export All",

      "admin.movLog": "Movement Log",
      "admin.search": "Search...",
      "admin.filter.all": "All",
      "admin.filter.capture": "Capture",
      "admin.filter.scrap": "Scrap",
      "admin.filter.alert": "Alert",
      "admin.filter.submit": "Submit",
      "admin.filter.downtime": "Downtime",
      "admin.filter.status": "Status",
      "admin.filter.session": "Session",
      "admin.clearLog": "Clear Log",

      "admin.data": "Data",
      "admin.clearToday": "Clear Today's Submissions & Alerts",
      "admin.clearSessions": "Delete All Sessions",
      "admin.confirmClearToday": "Clear today's submissions and alert history?",
      "admin.confirmClearSessions": "Delete ALL historical sessions? This cannot be undone.",
      "admin.resetTodayCloud": "Reset Today (Supabase + local)",
      "admin.resetTodayCloudBusy": "Deleting...",
      "admin.confirmResetTodayCloud": "Delete ALL today's data ({date}) in Supabase and on this device?\n\n• Captures, downtime, and events for today\n• Local sessions and bitácora\n\nThis cannot be undone.",
      "admin.resetTodayCloudPartial": "Supabase returned errors. Local data was deleted anyway.",

      "admin.btn.edit": "✎ Edit",
      "admin.btn.delete": "Delete",
      "admin.btn.breaks": "Breaks",

      "admin.alert.idLabel": "ID and label required",
      "admin.alert.idDup": "Duplicate ID",
      "admin.alert.allReq": "All fields required",
      "admin.alert.timeFmt": "Invalid time format (HH:MM)",
      "admin.alert.idName": "ID and name required",
      "admin.alert.allShift": "ID, label, start and end required",
      "admin.alert.timeHHMM": "Time must be HH:MM",
      "admin.alert.breakReq": "Fill start and end time for each break",
      "admin.confirmDelLine": "Delete line {id}?",
      "admin.confirmDelShift": "Delete shift {id}?",
      "admin.confirmDelOp": "Delete operator {id}?",

      "admin.log.cfgSaved": "Settings saved (target {target})",
      "admin.log.cfgReset": "Settings reset to defaults",
      "admin.log.clearedToday": "Today's submissions and alert history cleared",
      "admin.log.clearedSessions": "All sessions deleted",
      "admin.log.resetTodayCloud": "Day {date} reset (Supabase + local)",
      "admin.log.resetTodayCloudPartial": "Day {date} reset locally; partial errors in Supabase",
      "admin.log.lineAdded": "Line added: {id} {label}",
      "admin.log.lineEdited": "Line edited: {id} {label}",
      "admin.log.lineRemoved": "Line removed: {id}",
      "admin.log.shiftAdded": "Shift added: {id} {label} ({start}–{end})",
      "admin.log.shiftEdited": "Shift edited: {id}",
      "admin.log.shiftRemoved": "Shift removed: {id}",
      "admin.log.opAdded": "Operator added: {id} {name}",
      "admin.log.opEdited": "Operator edited: {id} {name}",
      "admin.log.opRemoved": "Operator removed: {id}",
      "admin.log.breaksUpdated": "Breaks updated for {id}",
      "admin.log.device": "Device: line {line}, operator {op}",

      "breaks.title": "Shift Breaks",
      "breaks.add": "+ Add Break",
      "breaks.empty": "No breaks.",

      "day.0": "Sun",
      "day.1": "Mon",
      "day.2": "Tue",
      "day.3": "Wed",
      "day.4": "Thu",
      "day.5": "Fri",
      "day.6": "Sat",
    },
  };

  function getLang() {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "es" || v === "en") return v;
    } catch (_) {}
    return DEFAULT_LANG;
  }

  function setLang(code) {
    if (code !== "es" && code !== "en") return;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (_) {}
    current = code;
    document.documentElement.setAttribute("lang", code);
    apply(document);
    window.dispatchEvent(new CustomEvent("languagechange", { detail: { lang: code } }));
  }

  function toggle() {
    setLang(current === "es" ? "en" : "es");
  }

  function fmt(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : "{" + k + "}"));
  }

  function t(key, params) {
    const dict = DICT[current] || DICT[DEFAULT_LANG];
    const fallback = DICT[DEFAULT_LANG];
    const val = (dict && dict[key]) || (fallback && fallback[key]) || key;
    return fmt(val, params);
  }

  // Apply translations to elements with i18n attributes within `root`.
  function apply(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
    });
    // <title>
    const titleEl = document.querySelector("title[data-i18n]");
    if (titleEl) document.title = t(titleEl.getAttribute("data-i18n"));
  }

  // Locale used for date formatting in app code.
  function locale() { return current === "en" ? "en-US" : "es-MX"; }

  let current = getLang();

  // Bind a button as a language toggle. Updates its label/title on each change.
  function bindToggle(btn) {
    if (!btn) return;
    const refresh = () => {
      btn.textContent = t("top.lang.toLabel");
      btn.setAttribute("title", t("top.lang.title"));
      btn.setAttribute("aria-label", t("top.lang.title"));
    };
    refresh();
    btn.addEventListener("click", toggle);
    window.addEventListener("languagechange", refresh);
  }

  function init() {
    document.documentElement.setAttribute("lang", current);
    apply(document);
  }

  // Apply as soon as DOM is parsed
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.i18n = { t, setLang, getLang, toggle, apply, bindToggle, locale };
})();
