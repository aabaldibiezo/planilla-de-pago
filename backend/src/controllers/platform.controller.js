const { validationResult } = require('express-validator');
const platform = require('../services/platform.service');
const audit = require('../services/audit.service');

/** Errores de dominio que corresponden a un 400 y no a un fallo del servidor. */
const CLIENT_ERROR_PATTERN = /no encontrad|ya está registrado|no existe|inactivo/i;

const handle = (fn) => async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const data = await fn(req);
    return res.json({ success: true, data });
  } catch (error) {
    if (error.code === 'P2002') {
      // El índice único de SubscriptionPayment impide cobrar dos veces el mismo mes.
      return res.status(409).json({
        success: false,
        error: 'Ya existe un pago registrado para esa empresa en ese mes',
      });
    }
    if (CLIENT_ERROR_PATTERN.test(error.message)) error.statusCode = 400;
    return next(error);
  }
};

// --------------- Empresas ---------------

exports.listCompanies = handle(() => platform.listCompanies());

exports.getCompany = handle((req) => platform.getCompany(req.params.id));

exports.createCompany = handle(async (req) => {
  const empresa = await platform.createCompany(req.body, req.user.id);
  await audit.record(req, {
    action: 'CREATE',
    entity: 'Company',
    entityId: empresa.id,
    newData: { name: empresa.name, plan: empresa.plan.name },
  });
  return empresa;
});

exports.changePlan = handle(async (req) => {
  const empresa = await platform.changePlan(req.params.id, req.body.planId, req.user.id);
  await audit.record(req, {
    action: 'CHANGE_PLAN',
    entity: 'Company',
    entityId: empresa.id,
    reason: req.body.reason,
    newData: { plan: empresa.plan.name },
  });
  return empresa;
});

exports.registerPayment = handle(async (req) => {
  const { payment, company } = await platform.registerPayment(
    req.params.id,
    req.body,
    req.user.id
  );
  await audit.record(req, {
    action: 'REGISTER_SUBSCRIPTION_PAYMENT',
    entity: 'SubscriptionPayment',
    entityId: payment.id,
    newData: {
      companyId: company.id,
      amountUsd: payment.amountUsd,
      period: `${payment.periodYear}-${payment.periodMonth}`,
      nextDueDate: company.nextDueDate,
    },
  });
  return { payment, company };
});

// --------------- Planes ---------------

exports.listPlans = handle(() => platform.listPlans());

exports.updatePlan = handle(async (req) => {
  const resultado = await platform.updatePlan(req.params.id, req.body);
  await audit.record(req, {
    action: 'UPDATE',
    entity: 'Plan',
    entityId: resultado.plan.id,
    newData: {
      name: resultado.plan.name,
      maxEmployees: resultado.plan.maxEmployees,
      monthlyPriceUsd: resultado.plan.monthlyPriceUsd,
    },
  });
  return resultado;
});

// --------------- Súper administradores ---------------

exports.listSuperAdmins = handle(() => platform.listSuperAdmins());

exports.createSuperAdmin = handle(async (req) => {
  const creado = await platform.createSuperAdmin(req.body);
  await audit.record(req, {
    action: 'CREATE_SUPER_ADMIN',
    entity: 'User',
    entityId: creado.id,
    newData: { email: creado.email },
  });
  return creado;
});
