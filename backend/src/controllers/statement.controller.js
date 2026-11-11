const { validationResult } = require('express-validator');
const statementService = require('../services/statement.service');
const auditService = require('../services/audit.service');

/**
 * "No encontrado" es también la respuesta cuando el recurso pertenece a otra
 * empresa: el servicio busca siempre acotado, así que un id ajeno no aparece.
 * Un 403 confirmaría que ese id existe.
 */
const NOT_FOUND_PATTERN = /no encontrad/i;
const CLIENT_ERROR_PATTERN = /Ya existe una categoría|Elija una categoría/i;

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

// --------------- Estado ---------------

exports.forMonth = handle((req) =>
  statementService.forMonth(req.user.companyId, req.query.month, req.query.year, {
    detalle: true,
  })
);

exports.history = handle((req) =>
  statementService.history(
    req.user.companyId,
    { month: Number(req.query.fromMonth), year: Number(req.query.fromYear) },
    { month: Number(req.query.toMonth), year: Number(req.query.toYear) }
  )
);

// --------------- Categorías ---------------

exports.listCategories = handle((req) =>
  statementService.listCategories(req.user.companyId, {
    includeInactive: req.query.includeInactive === 'true',
  })
);

exports.createCategory = handle(async (req) => {
  const categoria = await statementService.createCategory(
    req.user.companyId,
    req.body,
    req.user.id
  );
  await auditService.record(req, {
    action: 'CREATE',
    entity: 'ExpenseCategory',
    entityId: categoria.id,
    newData: categoria,
  });
  return categoria;
});

exports.updateCategory = handle(async (req) => {
  const categoria = await statementService.updateCategory(
    req.user.companyId,
    req.params.id,
    req.body,
    req.user.id
  );
  await auditService.record(req, {
    action: 'UPDATE',
    entity: 'ExpenseCategory',
    entityId: categoria.id,
    newData: categoria,
  });
  return categoria;
});

exports.removeCategory = handle(async (req) => {
  const resultado = await statementService.removeCategory(
    req.user.companyId,
    req.params.id,
    req.user.id
  );
  await auditService.record(req, {
    action: resultado.deleted ? 'DELETE' : 'DEACTIVATE',
    entity: 'ExpenseCategory',
    entityId: req.params.id,
    previousData: resultado,
  });

  return {
    message: resultado.deleted
      ? `Categoría "${resultado.name}" eliminada.`
      : `Categoría "${resultado.name}" desactivada. Se conserva porque tiene ${resultado.usedIn} movimiento(s) en meses ya registrados.`,
    ...resultado,
  };
});

exports.restoreCategories = handle(async (req) => {
  const resultado = await statementService.seedDefaultCategories(req.user.companyId);
  await auditService.record(req, {
    action: 'RESTORE_DEFAULTS',
    entity: 'ExpenseCategory',
    entityId: req.user.companyId,
    newData: resultado,
  });

  return {
    ...resultado,
    message: resultado.created
      ? `Se repusieron ${resultado.created} categoría(s).`
      : 'Las categorías predefinidas ya estaban todas.',
  };
});

// --------------- Movimientos ---------------

exports.createEntry = handle(async (req) => {
  const linea = await statementService.createEntry(req.user.companyId, req.body, req.user.id);
  await auditService.record(req, {
    action: 'CREATE',
    entity: 'StatementEntry',
    entityId: linea.id,
    newData: linea,
  });
  return linea;
});

exports.updateEntry = handle(async (req) => {
  const linea = await statementService.updateEntry(req.user.companyId, req.params.id, req.body);
  await auditService.record(req, {
    action: 'UPDATE',
    entity: 'StatementEntry',
    entityId: linea.id,
    newData: linea,
  });
  return linea;
});

exports.removeEntry = handle(async (req) => {
  const linea = await statementService.removeEntry(req.user.companyId, req.params.id);
  await auditService.record(req, {
    action: 'DELETE',
    entity: 'StatementEntry',
    entityId: linea.id,
    previousData: linea,
  });
  return { message: 'Movimiento eliminado.' };
});
