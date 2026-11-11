const { validationResult } = require('express-validator');
const holidayService = require('../services/holiday.service');
const auditService = require('../services/audit.service');

/** Un feriado de otra empresa responde 404, igual que uno inexistente. */
const NOT_FOUND_PATTERN = /no encontrad/i;
const CLIENT_ERROR_PATTERN = /ya es feriado nacional|Ya existe un feriado/i;

const handle = (fn) => async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const data = await fn(req);
    return res.json({ success: true, data });
  } catch (error) {
    if (NOT_FOUND_PATTERN.test(error.message)) error.statusCode = 404;
    else if (CLIENT_ERROR_PATTERN.test(error.message)) error.statusCode = 400;
    return next(error);
  }
};

exports.forYear = handle((req) => holidayService.forYear(req.user.companyId, req.query.year));

exports.create = handle(async (req) => {
  const feriado = await holidayService.create(req.user.companyId, req.body, req.user.id);
  await auditService.record(req, {
    action: 'CREATE',
    entity: 'Holiday',
    entityId: feriado.id,
    newData: feriado,
  });
  return feriado;
});

exports.remove = handle(async (req) => {
  const feriado = await holidayService.remove(req.user.companyId, req.params.id);
  await auditService.record(req, {
    action: 'DELETE',
    entity: 'Holiday',
    entityId: feriado.id,
    previousData: feriado,
  });
  return { id: feriado.id };
});

exports.setExtraDayFactor = handle(async (req) => {
  const resultado = await holidayService.setExtraDayFactor(
    req.user.companyId,
    req.body.extraDayFactor,
    req.user.id
  );
  await auditService.record(req, {
    action: 'UPDATE',
    entity: 'Company',
    entityId: req.user.companyId,
    newData: { extraDayFactor: Number(resultado.extraDayFactor) },
  });
  return { extraDayFactor: Number(resultado.extraDayFactor) };
});
