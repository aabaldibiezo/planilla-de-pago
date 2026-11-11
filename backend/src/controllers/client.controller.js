const { validationResult } = require('express-validator');
const clientService = require('../services/client.service');
const auditService = require('../services/audit.service');

/**
 * "No encontrado" se responde 404 y no 400.
 *
 * Es también la respuesta cuando el recurso existe pero es de otra empresa:
 * el servicio busca siempre acotado, así que un id ajeno simplemente no
 * aparece. Un 403 confirmaría que ese id existe, que es justo lo que no debe
 * saberse desde afuera.
 */
const NOT_FOUND_PATTERN = /no encontrad/i;
const CLIENT_ERROR_PATTERN =
  /no válid|no es válida|dado de baja|ya está vinculada|Ya existe un monto|ya está registrado como cobrado|no tiene monto cargado/i;

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

// --------------- Clientes ---------------

exports.list = handle((req) =>
  clientService.list(req.user.companyId, {
    includeInactive: req.query.includeInactive === 'true',
    month: req.query.month ? Number(req.query.month) : undefined,
    year: req.query.year ? Number(req.query.year) : undefined,
  })
);

exports.getById = handle((req) => clientService.getById(req.user.companyId, req.params.id));

exports.create = handle(async (req) => {
  const cliente = await clientService.create(req.user.companyId, req.body, req.user.id);
  await auditService.record(req, {
    action: 'CREATE',
    entity: 'Client',
    entityId: cliente.id,
    newData: cliente,
  });
  return cliente;
});

exports.update = handle(async (req) => {
  const cliente = await clientService.update(
    req.user.companyId,
    req.params.id,
    req.body,
    req.user.id
  );
  await auditService.record(req, {
    action: 'UPDATE',
    entity: 'Client',
    entityId: cliente.id,
    newData: cliente,
  });
  return cliente;
});

exports.remove = handle(async (req) => {
  const cliente = await clientService.remove(req.user.companyId, req.params.id, req.user.id);
  await auditService.record(req, {
    action: 'DEACTIVATE',
    entity: 'Client',
    entityId: cliente.id,
    previousData: cliente,
  });
  return { message: 'Cliente dado de baja junto con sus contratos' };
});

// --------------- Contratos ---------------

exports.createContract = handle(async (req) => {
  const contrato = await clientService.createContract(
    req.user.companyId,
    req.params.id,
    req.body,
    req.user.id
  );
  await auditService.record(req, {
    action: 'CREATE',
    entity: 'Contract',
    entityId: contrato.id,
    newData: contrato,
  });
  return contrato;
});

exports.updateContract = handle(async (req) => {
  const contrato = await clientService.updateContract(
    req.user.companyId,
    req.params.id,
    req.body,
    req.user.id
  );
  await auditService.record(req, {
    action: 'UPDATE',
    entity: 'Contract',
    entityId: contrato.id,
    newData: contrato,
  });
  return contrato;
});

// --------------- Montos ---------------

exports.rateHistory = handle((req) =>
  clientService.rateHistory(req.user.companyId, req.params.id)
);

exports.addRate = handle(async (req) => {
  const monto = await clientService.addRate(
    req.user.companyId,
    req.params.id,
    req.body,
    req.user.id
  );
  // El monto anterior no se toca, así que no hay `previousData`: el historial
  // completo es la trazabilidad.
  await auditService.record(req, {
    action: 'CREATE',
    entity: 'ContractRate',
    entityId: monto.id,
    reason: req.body.notes,
    newData: monto,
  });
  return monto;
});

exports.rateForPeriod = handle((req) =>
  clientService.rateForPeriod(
    req.user.companyId,
    req.params.id,
    Number(req.query.month),
    Number(req.query.year)
  )
);

// --------------- Cobros ---------------

exports.pendingCollections = handle((req) => clientService.pendingCollections(req.user.companyId));

exports.collect = handle(async (req) => {
  const cobro = await clientService.collect(
    req.user.companyId,
    req.params.id,
    req.body,
    req.user.id
  );
  await auditService.record(req, {
    action: 'COLLECT',
    entity: 'ContractCollection',
    entityId: cobro.id,
    newData: cobro,
  });
  return cobro;
});

exports.undoCollection = handle(async (req) => {
  const cobro = await clientService.undoCollection(
    req.user.companyId,
    req.params.id,
    req.params.month,
    req.params.year
  );
  await auditService.record(req, {
    action: 'DELETE',
    entity: 'ContractCollection',
    entityId: cobro.id,
    previousData: cobro,
  });
  return { id: cobro.id };
});
