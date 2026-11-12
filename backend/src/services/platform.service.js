const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const emailService = require('./email.service');
const statementService = require('./statement.service');
const { generateTemporaryPassword } = require('../lib/credentials');
const {
  sumarUnMes,
  etiquetaDeEstado,
  mesesCubiertos,
  vencimientoTrasPago,
} = require('../lib/subscription');
const { normalizePhone, isValidPhone } = require('../lib/contact');

/**
 * Administración de la plataforma: empresas clientes, planes y cobros.
 *
 * ⚠️ Todo el dinero de este servicio está en DÓLARES (USD). Los sueldos y las
 * boletas que gestiona cada empresa están en bolivianos y no se mezclan.
 *
 * Este servicio NO alcanza datos operativos (empleados, asistencia, nómina).
 * Lo único que consulta de una empresa es cuántos empleados activos tiene,
 * para contrastarlo con el límite de su plan.
 */

const PLAN_FIELDS = {
  id: true,
  code: true,
  name: true,
  maxEmployees: true,
  monthlyPriceUsd: true,
  isActive: true,
};

/** Empresa tal como la muestra el panel, con el uso de su plan resuelto. */
const conUso = (company, empleados) => ({
  id: company.id,
  name: company.name,
  taxId: company.taxId,
  contactEmail: company.contactEmail,
  contactPhone: company.contactPhone,
  status: company.status,
  statusLabel: etiquetaDeEstado(company),
  nextDueDate: company.nextDueDate,
  isActive: company.isActive,
  createdAt: company.createdAt,
  plan: company.plan,
  employeesUsed: empleados,
  employeeLimit: company.plan.maxEmployees,
  // Texto listo para mostrar ("8/10", "12/∞") para que cada cliente no lo arme.
  usageLabel: `${empleados}/${company.plan.maxEmployees ?? '∞'}`,
});

/**
 * Cuenta empleados activos por empresa en una sola consulta.
 * Con una consulta por empresa, el listado haría N+1.
 */
const conteoDeEmpleados = async (companyIds) => {
  const filas = await prisma.user.groupBy({
    by: ['companyId'],
    where: { companyId: { in: companyIds }, role: 'EMPLOYEE', isActive: true },
    _count: { _all: true },
  });

  return new Map(filas.map((fila) => [fila.companyId, fila._count._all]));
};

const listCompanies = async () => {
  const companies = await prisma.company.findMany({
    include: { plan: { select: PLAN_FIELDS } },
    orderBy: { name: 'asc' },
  });

  const conteos = await conteoDeEmpleados(companies.map((company) => company.id));

  return companies.map((company) => conUso(company, conteos.get(company.id) || 0));
};

const getCompany = async (id) => {
  const company = await prisma.company.findUnique({
    where: { id: Number(id) },
    include: {
      plan: { select: PLAN_FIELDS },
      subscriptionPayments: { orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }] },
    },
  });
  if (!company) throw new Error('Empresa no encontrada');

  const empleados = await prisma.user.count({
    where: { companyId: company.id, role: 'EMPLOYEE', isActive: true },
  });

  // Los administradores se listan para poder contactarlos; nunca los empleados.
  const admins = await prisma.user.findMany({
    where: { companyId: company.id, role: 'ADMIN' },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  return {
    ...conUso(company, empleados),
    admins,
    payments: company.subscriptionPayments,
  };
};

/**
 * Alta completa de una empresa cliente: crea la Company, le asigna un plan y
 * crea su primer usuario ADMIN con contraseña temporal.
 *
 * Todo dentro de una transacción: una empresa sin administrador no serviría
 * para nada y nadie podría entrar a arreglarla.
 */
const createCompany = async (data, actorId) => {
  const plan = await prisma.plan.findUnique({ where: { id: Number(data.planId) } });
  if (!plan || !plan.isActive) throw new Error('El plan seleccionado no existe o está inactivo');

  // El administrador entra con correo o con celular; basta uno de los dos.
  const adminEmail = data.adminEmail ? String(data.adminEmail).trim().toLowerCase() : null;
  const adminPhone = data.adminPhone ? normalizePhone(data.adminPhone) : null;
  if (!adminEmail && !adminPhone) {
    throw new Error('Indique el correo o el celular del administrador');
  }
  if (data.adminPhone && !isValidPhone(data.adminPhone)) {
    throw new Error('El celular del administrador debe tener 8 dígitos y empezar con 6 o 7');
  }
  if (adminEmail && (await prisma.user.findUnique({ where: { email: adminEmail } }))) {
    throw new Error('El correo del administrador ya está registrado');
  }
  if (adminPhone && (await prisma.user.findUnique({ where: { phone: adminPhone } }))) {
    throw new Error('El celular del administrador ya está registrado');
  }

  const temporaryPassword = generateTemporaryPassword();
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(temporaryPassword, salt);

  const resultado = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: data.name,
        taxId: data.taxId || null,
        contactEmail: data.contactEmail || adminEmail || null,
        contactPhone: data.contactPhone || null,
        planId: plan.id,
        status: 'ACTIVE',
        // Nace activa con un mes por delante; el primer cobro se registra al vencer.
        nextDueDate: sumarUnMes(new Date()),
        createdBy: actorId,
      },
      include: { plan: { select: PLAN_FIELDS } },
    });

    const admin = await tx.user.create({
      data: {
        companyId: company.id,
        email: adminEmail,
        phone: adminPhone,
        password: hashedPassword,
        firstName: data.adminFirstName,
        lastName: data.adminLastName,
        role: 'ADMIN',
        // El administrador de la empresa no cobra sueldo por este sistema.
        monthlySalary: 0,
        monthlyHours: 160,
        hourlyRate: 0,
        mustChangePassword: true,
      },
      select: { id: true, email: true, phone: true, firstName: true, lastName: true },
    });

    // Categorías de gasto predefinidas, para que el estado de resultados
    // sea usable desde el primer día sin que nadie tenga que inventarlas.
    await statementService.seedDefaultCategories(company.id, tx);

    return { company, admin };
  });

  // Fuera de la transacción: un SMTP caído no debe revertir el alta. Queda el
  // reenvío de credenciales desde el panel de la empresa como vía de rescate.
  // Sin correo (o sin servidor de correo) la contraseña temporal se devuelve
  // para que el súper administrador se la pase por WhatsApp; si no, se perdería.
  const delivery = adminEmail
    ? await emailService.sendCredentialsEmail(
        resultado.admin,
        temporaryPassword,
        process.env.APP_PUBLIC_URL
      )
    : { success: false, error: 'El administrador no tiene correo' };

  if (delivery.success) {
    await prisma.user.update({
      where: { id: resultado.admin.id },
      data: { credentialsSentAt: new Date() },
    });
  } else {
    await prisma.user.update({
      where: { id: resultado.admin.id },
      data: { credentialsError: delivery.error },
    });
  }

  return {
    ...conUso(resultado.company, 0),
    admin: resultado.admin,
    credentialsDelivered: delivery.success,
    credentialsError: delivery.success ? null : delivery.error,
    temporaryPassword: delivery.success ? null : temporaryPassword,
  };
};

/** Cambio manual de plan, para acuerdos particulares con una empresa. */
const changePlan = async (companyId, planId, actorId) => {
  const company = await prisma.company.findUnique({
    where: { id: Number(companyId) },
    include: { plan: true },
  });
  if (!company) throw new Error('Empresa no encontrada');

  const plan = await prisma.plan.findUnique({ where: { id: Number(planId) } });
  if (!plan || !plan.isActive) throw new Error('El plan seleccionado no existe o está inactivo');

  const empleados = await prisma.user.count({
    where: { companyId: company.id, role: 'EMPLOYEE', isActive: true },
  });

  const actualizada = await prisma.company.update({
    where: { id: company.id },
    data: { planId: plan.id, updatedBy: actorId },
    include: { plan: { select: PLAN_FIELDS } },
  });

  return {
    ...conUso(actualizada, empleados),
    // Bajar de plan no expulsa a nadie: el límite solo frena altas nuevas. Se
    // avisa para que la decisión sea consciente.
    warning:
      plan.maxEmployees !== null && empleados > plan.maxEmployees
        ? `La empresa tiene ${empleados} empleados activos y el plan ${plan.name} permite ` +
          `${plan.maxEmployees}. No se dio de baja a nadie, pero no podrá agregar empleados ` +
          'hasta quedar por debajo del límite.'
        : null,
  };
};

/**
 * Registra un pago de suscripción, reactiva la empresa y corre el vencimiento.
 *
 * El vencimiento se cuenta desde el vencimiento anterior y no desde hoy: quien
 * paga tarde no gana días gratis.
 */
const registerPayment = async (companyId, data, actorId) => {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: { id: Number(companyId) },
      include: { plan: true },
    });
    if (!company) throw new Error('Empresa no encontrada');

    const paidAt = data.paidAt ? new Date(data.paidAt) : new Date();
    const meses = mesesCubiertos(data.monthsPaid);
    const nuevoVencimiento = vencimientoTrasPago(company.nextDueDate, paidAt, meses.total);

    const pago = await tx.subscriptionPayment.create({
      data: {
        companyId: company.id,
        amountUsd: Number(data.amountUsd),
        paidAt,
        periodMonth: Number(data.periodMonth),
        periodYear: Number(data.periodYear),
        monthsPaid: meses.pagados,
        bonusMonths: meses.regalo,
        planNameSnapshot: company.plan.name,
        planPriceUsdSnapshot: company.plan.monthlyPriceUsd,
        recordedBy: actorId,
        notes: data.notes || null,
      },
    });

    const actualizada = await tx.company.update({
      where: { id: company.id },
      data: {
        status: 'ACTIVE',
        nextDueDate: nuevoVencimiento,
        // Se limpia para que el aviso vuelva a dispararse en el ciclo siguiente.
        reminderSentFor: null,
        updatedBy: actorId,
      },
      include: { plan: { select: PLAN_FIELDS } },
    });

    return { payment: pago, company: actualizada };
  });
};

/**
 * Activa o desactiva una empresa a mano (por ejemplo, por falta de pago).
 * Desactivada, nadie de la empresa puede entrar: ni el administrador ni el
 * personal desde la app. Los datos se conservan intactos para cuando vuelva.
 */
const setCompanyActive = async (companyId, active, actorId) => {
  const company = await prisma.company.findUnique({ where: { id: Number(companyId) } });
  if (!company) throw new Error('Empresa no encontrada');

  const actualizada = await prisma.company.update({
    where: { id: company.id },
    data: { isActive: Boolean(active), updatedBy: actorId },
    include: { plan: { select: PLAN_FIELDS } },
  });

  const empleados = await prisma.user.count({
    where: { companyId: company.id, role: 'EMPLOYEE', isActive: true },
  });
  return conUso(actualizada, empleados);
};

/** Planes con la cantidad de empresas que tiene cada uno. */
const listPlans = async () => {
  const plans = await prisma.plan.findMany({ orderBy: { monthlyPriceUsd: 'asc' } });
  const conteos = await prisma.company.groupBy({
    by: ['planId'],
    _count: { _all: true },
  });
  const porPlan = new Map(conteos.map((fila) => [fila.planId, fila._count._all]));

  return plans.map((plan) => ({ ...plan, companiesCount: porPlan.get(plan.id) || 0 }));
};

/**
 * Edición de un plan. `code` no se puede cambiar: es el identificador estable
 * al que apuntan los seeds y las migraciones.
 */
const updatePlan = async (id, data) => {
  const plan = await prisma.plan.findUnique({ where: { id: Number(id) } });
  if (!plan) throw new Error('Plan no encontrado');

  const maxEmployees =
    data.maxEmployees === undefined
      ? plan.maxEmployees
      : data.maxEmployees === null || data.maxEmployees === ''
        ? null
        : Number(data.maxEmployees);

  const actualizado = await prisma.plan.update({
    where: { id: plan.id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.monthlyPriceUsd !== undefined && {
        monthlyPriceUsd: Number(data.monthlyPriceUsd),
      }),
      maxEmployees,
    },
  });

  // Advertencia, no bloqueo: bajar el límite es una decisión comercial válida
  // y las empresas que ya lo superan simplemente no podrán crecer.
  let excedidas = [];
  if (maxEmployees !== null) {
    const companies = await prisma.company.findMany({
      where: { planId: plan.id },
      select: { id: true, name: true },
    });
    const conteos = await conteoDeEmpleados(companies.map((company) => company.id));
    excedidas = companies
      .map((company) => ({ ...company, employees: conteos.get(company.id) || 0 }))
      .filter((company) => company.employees > maxEmployees);
  }

  return { plan: actualizado, companiesOverLimit: excedidas };
};

/**
 * Crea otro súper administrador.
 *
 * `companyId` queda en null a propósito: administra la plataforma y no debe
 * alcanzar datos operativos de ninguna empresa. La restricción
 * `user_company_scope` de la base lo exige.
 */
const createSuperAdmin = async (data) => {
  const existente = await prisma.user.findUnique({ where: { email: data.email } });
  if (existente) throw new Error('El email ya está registrado');

  const temporaryPassword = generateTemporaryPassword();
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(temporaryPassword, salt);

  const creado = await prisma.user.create({
    data: {
      companyId: null,
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      role: 'SUPER_ADMIN',
      monthlySalary: 0,
      monthlyHours: 160,
      hourlyRate: 0,
      mustChangePassword: true,
    },
    select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
  });

  const delivery = await emailService.sendCredentialsEmail(
    creado,
    temporaryPassword,
    process.env.APP_PUBLIC_URL
  );

  return { ...creado, credentialsDelivered: delivery.success };
};

const listSuperAdmins = () =>
  prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      lastName: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

module.exports = {
  listCompanies,
  getCompany,
  createCompany,
  setCompanyActive,
  changePlan,
  registerPayment,
  listPlans,
  updatePlan,
  createSuperAdmin,
  listSuperAdmins,
};
