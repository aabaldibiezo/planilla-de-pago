const { validationResult } = require('express-validator');
const worksiteService = require('../services/worksite.service');
const auditService = require('../services/audit.service');

const CLIENT_ERROR_PATTERN = /no encontrad|no válid|inactiv|no ambos|no es válido/i;

const handle = (fn) => async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const data = await fn(req);
    return res.json({ success: true, data });
  } catch (error) {
    // El cruce de horarios lleva su propio código para que el panel muestre el
    // aviso sin analizar el texto, igual que `GeofenceError` en asistencia.
    if (error.name === 'WorksiteScheduleConflictError') {
      return res.status(409).json({ success: false, error: error.message, code: error.code });
    }
    if (CLIENT_ERROR_PATTERN.test(error.message)) error.statusCode = 400;
    return next(error);
  }
};

// --------------- Sedes ---------------

exports.list = handle((req) => worksiteService.list(req.user.companyId, req.query));

exports.create = handle(async (req) => {
  const sede = await worksiteService.create(req.user.companyId, req.body, req.user.id);
  await auditService.record(req, {
    action: 'CREATE',
    entity: 'Worksite',
    entityId: sede.id,
    newData: sede,
  });
  return sede;
});

exports.update = handle(async (req) => {
  const sede = await worksiteService.update(req.user.companyId, req.params.id, req.body, req.user.id);
  await auditService.record(req, {
    action: 'UPDATE',
    entity: 'Worksite',
    entityId: sede.id,
    newData: sede,
  });
  return sede;
});

exports.remove = handle(async (req) => {
  const sede = await worksiteService.remove(req.user.companyId, req.params.id);
  await auditService.record(req, {
    action: 'DEACTIVATE',
    entity: 'Worksite',
    entityId: sede.id,
    previousData: sede,
  });
  return { message: 'Sede desactivada correctamente' };
});

// --------------- Asignaciones ---------------

exports.listAssignments = handle((req) => worksiteService.listAssignments(req.user.companyId, req.query));

exports.createAssignment = handle(async (req) => {
  const asignacion = await worksiteService.createAssignment(req.user.companyId, req.body, req.user.id);
  await auditService.record(req, {
    action: 'CREATE',
    entity: 'WorksiteAssignment',
    entityId: asignacion.id,
    employeeId: asignacion.userId,
    newData: asignacion,
  });
  return asignacion;
});

exports.employeesWithoutWorksiteToday = handle((req) =>
  worksiteService.employeesWithoutWorksiteToday(req.user.companyId)
);

exports.assignmentConflicts = handle((req) =>
  worksiteService.listAssignmentConflicts(req.user.companyId)
);

exports.removeAssignment = handle(async (req) => {
  const asignacion = await worksiteService.removeAssignment(req.user.companyId, req.params.id);
  await auditService.record(req, {
    action: 'DEACTIVATE',
    entity: 'WorksiteAssignment',
    entityId: asignacion.id,
    employeeId: asignacion.userId,
    previousData: asignacion,
  });
  return { message: 'Asignación desactivada correctamente' };
});
