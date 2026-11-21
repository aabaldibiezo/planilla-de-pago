const { validationResult } = require('express-validator');
const attendanceService = require('../services/attendance.service');
const auditService = require('../services/audit.service');

const getAll = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const filters = {
      userId: req.user.role === 'ADMIN' ? req.query.userId || undefined : req.user.id,
      month: req.query.month || undefined,
      year: req.query.year || undefined,
    };

    const entries = await attendanceService.getAll(req.user.companyId, filters);
    res.json({ success: true, data: entries });
  } catch (error) {
    next(error);
  }
};

const upsert = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const entry = await attendanceService.upsert(req.user.companyId, req.body);
    await auditService.record(req, {
      action: 'UPSERT',
      entity: 'Attendance',
      entityId: entry.id,
      employeeId: entry.userId,
      newData: entry,
    });
    res.status(200).json({ success: true, data: entry });
  } catch (error) {
    if (error.message.includes('no existe')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
};

const clockInSession = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const row = await attendanceService.clockInSession(
      req.user.companyId,
      req.body.userId,
      req.user.id,
      req.body.notes
    );
    await auditService.record(req, {
      action: 'CLOCK_IN',
      entity: 'AttendanceSession',
      entityId: row.id,
      employeeId: row.userId,
      newData: row,
    });

    return res.status(201).json({ success: true, data: row });
  } catch (error) {
    if (/no existe|pendiente/i.test(error.message)) {
      error.statusCode = 400;
    }
    return next(error);
  }
};

const clockOutSession = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const row = await attendanceService.clockOutSession(req.user.companyId, req.params.id, req.user.id);
    await auditService.record(req, {
      action: 'CLOCK_OUT',
      entity: 'AttendanceSession',
      entityId: row.id,
      employeeId: row.userId,
      newData: row,
    });

    return res.json({ success: true, data: row });
  } catch (error) {
    if (/no encontr|ya fue|posterior/i.test(error.message)) {
      error.statusCode = 400;
    }
    return next(error);
  }
};
const justifySession = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const row = await attendanceService.justifySession(req.user.companyId, req.params.id, req.body, req.user.id);
    await auditService.record(req, {
      action: req.body.status,
      entity: 'AttendanceJustification',
      entityId: row.id,
      employeeId: row.userId,
      newData: row,
      reason: req.body.decisionReason || req.body.reason,
    });
    res.json({ success: true, data: row });
  } catch (error) {
    next(error);
  }
};
/**
 * Marcación de entrada desde la app móvil.
 *
 * La respuesta es deliberadamente opaca: no revela la distancia, la sede ni
 * si la marcación quedó señalada. El empleado ve siempre lo mismo.
 */
const selfClockIn = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const sesion = await attendanceService.selfClockIn(req.user.companyId, req.user.id, req.body);

    await auditService.record(req, {
      action: 'SELF_CLOCK_IN',
      entity: 'AttendanceSession',
      entityId: sesion.id,
      employeeId: sesion.userId,
      newData: {
        locationStatus: sesion.locationStatus,
        distanceMeters: sesion.distanceMeters,
        matchedWorksiteId: sesion.matchedWorksiteId,
      },
    });

    return res.status(201).json({
      success: true,
      data: {
        id: sesion.id,
        clockIn: sesion.clockIn,
        workDate: sesion.workDate,
        message: 'Entrada registrada correctamente',
      },
    });
  } catch (error) {
    // El bloqueo por geocerco lleva su propio código para que la aplicación
    // sepa qué mensaje mostrar sin analizar el texto.
    if (error.name === 'GeofenceError') {
      return res.status(422).json({ success: false, error: error.message, code: error.code });
    }
    if (/pendiente|foto|imagen|tamaño|data URI|vacía/i.test(error.message)) {
      error.statusCode = 400;
    }
    return next(error);
  }
};

const selfClockOut = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const sesion = await attendanceService.selfClockOut(req.user.companyId, req.user.id, req.params.id, req.body);

    await auditService.record(req, {
      action: 'SELF_CLOCK_OUT',
      entity: 'AttendanceSession',
      entityId: sesion.id,
      employeeId: sesion.userId,
    });

    return res.json({
      success: true,
      data: {
        id: sesion.id,
        clockOut: sesion.clockOut,
        workedMinutes: sesion.workedMinutes,
        message: 'Salida registrada correctamente',
      },
    });
  } catch (error) {
    if (error.name === 'GeofenceError') {
      return res.status(422).json({ success: false, error: error.message, code: error.code });
    }
    if (/no encontrada|propias|ya fue|posterior|foto|imagen|tamaño/i.test(error.message)) {
      error.statusCode = 400;
    }
    return next(error);
  }
};

/** Registro manual de entrada por parte del administrador. */
const registerWorkedDay = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const sesion = await attendanceService.registerWorkedDay(
      req.user.companyId,
      req.body.userId,
      {
        date: String(req.body.date).slice(0, 10),
        startTime: req.body.startTime,
        endTime: req.body.endTime,
        worksiteId: req.body.worksiteId,
      },
      req.user.id
    );

    await auditService.record(req, {
      action: 'REGISTER_WORKED_DAY',
      entity: 'AttendanceSession',
      entityId: sesion.id,
      employeeId: sesion.userId,
      newData: { workDate: sesion.workDate, workedMinutes: sesion.workedMinutes },
    });

    return res.status(201).json({ success: true, data: sesion });
  } catch (error) {
    if (/temporal|no existe|ya está registrado|todavía no llegó|sede/i.test(error.message)) {
      error.statusCode = 400;
    }
    return next(error);
  }
};

const manualClockIn = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const sesion = await attendanceService.manualClockIn(
      req.user.companyId,
      req.body.userId,
      req.user.id,
      req.body.reason
    );

    await auditService.record(req, {
      action: 'MANUAL_CLOCK_IN',
      entity: 'AttendanceSession',
      entityId: sesion.id,
      employeeId: sesion.userId,
      reason: req.body.reason,
      newData: { registeredManually: true },
    });

    return res.status(201).json({ success: true, data: sesion });
  } catch (error) {
    if (/motivo|pendiente|no existe/i.test(error.message)) error.statusCode = 400;
    return next(error);
  }
};

/** Estado actual del empleado: si tiene una marcación abierta o no. */
const selfStatus = async (req, res, next) => {
  try {
    const abierta = await attendanceService.openSessionFor(req.user.companyId, req.user.id);
    return res.json({
      success: true,
      data: { hasOpenSession: Boolean(abierta), session: abierta || null },
    });
  } catch (error) {
    return next(error);
  }
};

/** Bandeja de marcaciones sospechosas (solo administrador). */
const listForReview = async (req, res, next) => {
  try {
    const filas = await attendanceService.listForReview(req.user.companyId, req.query);
    return res.json({ success: true, data: filas });
  } catch (error) {
    return next(error);
  }
};

const reviewSession = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const sesion = await attendanceService.reviewSession(req.user.companyId, req.params.id, req.body, req.user.id);

    await auditService.record(req, {
      action: `REVIEW_${req.body.status}`,
      entity: 'AttendanceSession',
      entityId: sesion.id,
      employeeId: sesion.userId,
      reason: req.body.notes,
      newData: { reviewStatus: sesion.reviewStatus },
    });

    return res.json({ success: true, data: sesion });
  } catch (error) {
    if (/no encontrada|pendiente/i.test(error.message)) error.statusCode = 400;
    return next(error);
  }
};

module.exports = {
  getAll,
  upsert,
  clockInSession,
  clockOutSession,
  justifySession,
  selfClockIn,
  selfClockOut,
  selfStatus,
  manualClockIn,
  registerWorkedDay,
  listForReview,
  reviewSession,
};

// --------------- Encargado de sede: marca a su equipo ---------------

/** Respuesta común de errores de las rutas del equipo. */
const errorDeEquipo = (error, res, next) => {
  if (error.name === 'GeofenceError') {
    return res.status(422).json({ success: false, error: error.message, code: error.code });
  }
  if (/pendiente|foto|imagen|tamaño|data URI|vacía|ya fue|no encontrada|no existe/i.test(error.message)) {
    error.statusCode = 400;
  }
  return next(error);
};

const teamToday = async (req, res, next) => {
  try {
    const equipo = await attendanceService.teamToday(req.user.companyId, req.user.id);
    return res.json({ success: true, data: equipo });
  } catch (error) {
    return errorDeEquipo(error, res, next);
  }
};

const teamClockIn = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const sesion = await attendanceService.teamClockIn(req.user.companyId, req.user.id, req.body);
    await auditService.record(req, {
      action: 'TEAM_CLOCK_IN',
      entity: 'AttendanceSession',
      entityId: sesion.id,
      employeeId: sesion.userId,
      reason: 'Marcado por el encargado de sede',
      newData: {
        locationStatus: sesion.locationStatus,
        distanceMeters: sesion.distanceMeters,
        matchedWorksiteId: sesion.matchedWorksiteId,
        latitude: sesion.capturedLatitude,
        longitude: sesion.capturedLongitude,
      },
    });
    return res.status(201).json({
      success: true,
      data: { id: sesion.id, clockIn: sesion.clockIn, message: 'Entrada registrada' },
    });
  } catch (error) {
    return errorDeEquipo(error, res, next);
  }
};

const teamClockOut = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const sesion = await attendanceService.teamClockOut(
      req.user.companyId,
      req.user.id,
      req.params.id,
      req.body
    );
    await auditService.record(req, {
      action: 'TEAM_CLOCK_OUT',
      entity: 'AttendanceSession',
      entityId: sesion.id,
      employeeId: sesion.userId,
      reason: 'Marcado por el encargado de sede',
      newData: {
        clockOutLocationStatus: sesion.clockOutLocationStatus,
        latitude: sesion.clockOutLatitude,
        longitude: sesion.clockOutLongitude,
      },
    });
    return res.json({
      success: true,
      data: { id: sesion.id, clockOut: sesion.clockOut, message: 'Salida registrada' },
    });
  } catch (error) {
    return errorDeEquipo(error, res, next);
  }
};

module.exports.teamToday = teamToday;
module.exports.teamClockIn = teamClockIn;
module.exports.teamClockOut = teamClockOut;
