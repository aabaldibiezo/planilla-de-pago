const { validationResult } = require('express-validator');
const workforce = require('../services/workforce.service');
const audit = require('../services/audit.service');

/** Errores de dominio que corresponden a un 400 y no a un fallo del servidor. */
const CLIENT_ERROR_PATTERN =
  /no encontr|Solo |solapa|debe|disponible|duplic|inactivo|tarifa|monto|multiplicador|retrasos/i;

/** Serializa la respuesta convirtiendo los BigInt de la auditoría a texto. */
const toJsonSafe = (data) =>
  JSON.parse(
    JSON.stringify({ success: true, data }, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );

/**
 * Envuelve un handler: valida la petición, serializa la respuesta y
 * traduce los errores de dominio al código HTTP correspondiente.
 */
const handle = (fn) => async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const data = await fn(req);
    return res.json(toJsonSafe(data));
  } catch (error) {
    if (error.code === 'P2002') {
      error.statusCode = 409;
    } else if (CLIENT_ERROR_PATTERN.test(error.message)) {
      error.statusCode = 400;
    }
    return next(error);
  }
};

// --------------- Horas extra ---------------

exports.listOvertime = handle((req) => workforce.list(req.user.companyId, 'overtime', req.query));

exports.createOvertime = handle(async (req) => {
  const row = await workforce.createOvertime(req.user.companyId, req.body, req.user.id);
  await audit.record(req, {
    action: 'CREATE',
    entity: 'Overtime',
    entityId: row.id,
    employeeId: row.userId,
    newData: row,
  });
  return row;
});

exports.updateOvertime = handle(async (req) => {
  const row = await workforce.updateOvertime(req.user.companyId, req.params.id, req.body);
  await audit.record(req, {
    action: 'UPDATE',
    entity: 'Overtime',
    entityId: row.id,
    employeeId: row.userId,
    newData: row,
  });
  return row;
});

exports.approveOvertime = handle(async (req) => {
  const row = await workforce.approveOvertime(req.user.companyId, req.params.id, req.body.status, req.user.id);
  await audit.record(req, {
    action: req.body.status,
    entity: 'Overtime',
    entityId: row.id,
    employeeId: row.userId,
    newData: row,
    reason: req.body.reason,
  });
  return row;
});

exports.removeOvertime = handle(async (req) => {
  const row = await workforce.removeOvertime(req.user.companyId, req.params.id);
  await audit.record(req, {
    action: 'DELETE',
    entity: 'Overtime',
    entityId: row.id,
    employeeId: row.userId,
    previousData: row,
  });
  return { message: 'Hora extra eliminada correctamente' };
});

// --------------- Descuentos ---------------

exports.listDiscounts = handle((req) => workforce.list(req.user.companyId, 'discount', req.query));

exports.createDiscount = handle(async (req) => {
  const row = await workforce.createDiscount(req.user.companyId, req.body, req.user.id);
  await audit.record(req, {
    action: 'CREATE',
    entity: 'Discount',
    entityId: row.id,
    employeeId: row.userId,
    newData: row,
  });
  return row;
});

exports.approveDiscount = handle(async (req) => {
  const row = await workforce.approveDiscount(req.user.companyId, req.params.id, req.body.status, req.user.id);
  await audit.record(req, {
    action: req.body.status,
    entity: 'Discount',
    entityId: row.id,
    employeeId: row.userId,
    newData: row,
    reason: req.body.reason,
  });
  return row;
});

// --------------- Compensaciones y auditoría ---------------

exports.listCompensations = handle((req) => workforce.list(req.user.companyId, 'timeCompensation', req.query));

exports.useCompensation = handle(async (req) => {
  const row = await workforce.useCompensation(
    req.user.companyId,
    req.params.id,
    req.body.hours,
    req.user.id,
    req.body.notes
  );
  await audit.record(req, {
    action: 'USE',
    entity: 'TimeCompensation',
    entityId: row.id,
    employeeId: row.userId,
    newData: row,
  });
  return row;
});

exports.listAudit = handle((req) => audit.list(req.user.companyId, req.query));
