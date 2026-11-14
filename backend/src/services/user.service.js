const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { isDaily, hourlyRateFor } = require('../lib/pay-scheme');
const prisma = require('../lib/prisma');
const scheduleService = require('./schedule.service');
const emailService = require('./email.service');
const { generateTemporaryPassword, assertPasswordStrength } = require('../lib/credentials');
const { scope } = require('../lib/tenant');
const { normalizePhone, isValidPhone } = require('../lib/contact');
const { filtroDeVisibles, assertPuedeCrear, assertPuedeGestionar } = require('../lib/admin-access');

/** Campos expuestos por la API; nunca incluye el hash de la contraseña. */
const PUBLIC_FIELDS = {
  id: true,
  companyId: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isOwner: true,
  employeeType: true,
  staffCategory: true,
  monthlySalary: true,
  monthlyHours: true,
  hourlyRate: true,
  dailyWage: true,
  scheduledEntryTime: true,
  isActive: true,
  mustChangePassword: true,
  passwordSetAt: true,
  lastLoginAt: true,
  credentialsSentAt: true,
  credentialsError: true,
  createdAt: true,
  updatedAt: true,
  scheduleType: true,
};

/**
 * Error de negocio al superar el límite de empleados del plan contratado.
 * Lleva código propio para que el cliente distinga este caso sin analizar el
 * texto del mensaje, igual que `GeofenceError` en asistencia.
 */
class PlanLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PlanLimitError';
    this.code = 'PLAN_LIMIT_REACHED';
  }
}

/**
 * Verifica que la empresa pueda sumar un empleado activo más.
 *
 * Se ejecuta DENTRO de la transacción y bloqueando la fila de la empresa
 * (`FOR UPDATE`). Sin el bloqueo, dos altas simultáneas pueden leer ambas
 * "9 de 10" y dejar 11 empleados en un plan de 10: el chequeo pasaría dos
 * veces sobre el mismo estado. Es el mismo cuidado que ya se tuvo con el pago
 * duplicado de nómina.
 */
const assertEmployeeQuota = async (tx, companyId) => {
  // Serializa las altas de esta empresa; no afecta a las demás.
  await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;

  const company = await tx.company.findUnique({
    where: { id: companyId },
    include: { plan: true },
  });
  if (!company) throw new Error('La empresa no existe');

  // El plan Empresarial es ilimitado: `maxEmployees` null significa sin tope.
  if (company.plan.maxEmployees === null) return;

  const activos = await tx.user.count({
    where: { companyId, role: 'EMPLOYEE', isActive: true },
  });

  if (activos >= company.plan.maxEmployees) {
    throw new PlanLimitError(
      `Su plan ${company.plan.name} permite hasta ${company.plan.maxEmployees} empleados activos ` +
        `y ya tiene ${activos}. Debe subir de plan para agregar más empleados.`
    );
  }
};

/**
 * Get all active users (excluding passwords).
 */
const getAll = async (requestingUser) => {
  const companyId = requestingUser.companyId;

  return prisma.user.findMany({
    // Un administrador común no ve a los demás administradores; el gerente
    // general (dueño) ve a todos. Ver lib/admin-access.
    where: { ...scope('user', companyId), isActive: true, ...filtroDeVisibles(requestingUser) },
    select: {
      ...PUBLIC_FIELDS,
      scheduleBlocks: {
        where: { isActive: true },
        orderBy: [{ dayOfWeek: 'asc' }, { blockOrder: 'asc' }],
      },
    },
    orderBy: { lastName: 'asc' },
  });
};

/**
 * Crea un usuario y calcula automáticamente su tarifa por hora.
 *
 * Si no se envía una contraseña se genera una temporal, se marca
 * `mustChangePassword` y se envía por correo. El envío ocurre fuera de la
 * transacción: un fallo de SMTP no debe impedir el alta del empleado, queda
 * registrado en `credentialsError` y el administrador puede reenviarla.
 */
const create = async (companyId, data, actorId, actor = null) => {
  if (actor) assertPuedeCrear(actor, data.role || 'EMPLOYEE');

  // El fijo cobra sueldo mensual; el temporal, por día. Ver lib/pay-scheme.
  const employeeType = data.employeeType || 'FIJO';

  // Se entra a la aplicación con el correo o con el celular: el fijo debe
  // tener al menos uno. El temporal puede no tener ninguno: trabaja un día,
  // el encargado le marca la asistencia y no usa la aplicación, así que no se
  // le genera contraseña.
  const phone = normalizePhone(data.phone);
  if (phone && !isValidPhone(phone)) {
    throw new Error('El celular debe tener 8 dígitos y empezar en 6 o 7');
  }
  const sinAcceso = isDaily(employeeType) && !data.email && !phone;
  if (!data.email && !phone && !sinAcceso) {
    throw new Error('Indique el correo o el celular');
  }
  if (phone) {
    const ocupado = await prisma.user.findUnique({ where: { phone } });
    if (ocupado) throw new Error('El celular ya está registrado');
  }

  // El correo es único a nivel global, no por empresa, porque el login se hace
  // solo con el correo: repetirlo entre empresas volvería ambigua la sesión.
  // Por eso esta búsqueda NO se acota por empresa.
  if (data.email) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new Error('El email ya está registrado');
    }
  }
  const monthlySalary = isDaily(employeeType) ? 0 : parseFloat(data.monthlySalary || 0);
  const monthlyHours = parseFloat(data.monthlyHours || 240);
  const dailyWage = isDaily(employeeType) ? parseFloat(data.dailyWage || 0) : 0;
  const hourlyRate = hourlyRateFor({ employeeType, monthlySalary, monthlyHours, dailyWage });

  if ((data.role || 'EMPLOYEE') === 'ADMIN' && !data.password) {
    throw new Error('La contraseña es obligatoria para administradores');
  }
  if (data.password) {
    assertPasswordStrength(data.password);
  }

  const temporaryPassword = data.password || sinAcceso ? null : generateTemporaryPassword();
  const salt = await bcrypt.genSalt(10);
  // Sin acceso se guarda el hash de un valor aleatorio que nadie conoce: la
  // columna es obligatoria y así no existe contraseña con la que entrar.
  const hashedPassword = await bcrypt.hash(
    data.password || temporaryPassword || crypto.randomBytes(32).toString('hex'),
    salt
  );

  const user = await prisma.$transaction(async (tx) => {
    // Un ADMIN adicional no consume cupo: el límite del plan cuenta empleados.
    if ((data.role || 'EMPLOYEE') === 'EMPLOYEE') {
      await assertEmployeeQuota(tx, companyId);
    }

    const created = await tx.user.create({
      data: {
        companyId,
        email: data.email || null,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone,
        role: data.role || 'EMPLOYEE',
        employeeType,
        staffCategory: data.staffCategory || 'OPERATIVO',
        monthlySalary,
        monthlyHours,
        dailyWage,
        hourlyRate,
        scheduledEntryTime: data.scheduledEntryTime || '08:00',
        scheduleType: data.scheduleType || 'FULL_TIME',
        mustChangePassword: Boolean(temporaryPassword),
        passwordSetAt: temporaryPassword || sinAcceso ? null : new Date(),
      },
      select: PUBLIC_FIELDS,
    });
    if (data.scheduleBlocks?.length) {
      await scheduleService.replaceForUser(
        tx,
        created.id,
        data.scheduleType || 'FULL_TIME',
        data.scheduleBlocks,
        actorId
      );
    }
    // `select` explícito: con `include` Prisma devolvería también el hash de la contraseña.
    return tx.user.findUnique({
      where: { id: created.id },
      select: {
        ...PUBLIC_FIELDS,
        scheduleBlocks: {
          where: { isActive: true },
          orderBy: [{ dayOfWeek: 'asc' }, { blockOrder: 'asc' }],
        },
      },
    });
  });

  if (!temporaryPassword) return user;

  // El alta ya está confirmada; el correo se intenta después y su fallo no la
  // revierte. Sin correo (solo celular) no hay a dónde mandarla: se le muestra
  // al administrador para que la pase por mensaje.
  const delivery = user.email
    ? await emailService.sendCredentialsEmail(user, temporaryPassword, process.env.APP_PUBLIC_URL)
    : { success: false, error: 'Sin correo: entregue la clave por mensaje' };

  const credentialState = delivery.success
    ? { credentialsSentAt: new Date(), credentialsError: null }
    : { credentialsError: delivery.error };

  await prisma.user.update({ where: { id: user.id }, data: credentialState });

  return {
    ...user,
    ...credentialState,
    credentialsDelivered: delivery.success,
    // Sin correo la clave se perdería y nadie podría entrar: se le devuelve al
    // administrador una sola vez para que la entregue en mano o por mensaje.
    temporaryPassword: delivery.success ? undefined : temporaryPassword,
  };
};

/**
 * Update a user.
 * Re-calculates hourlyRate if monthlySalary or monthlyHours changes.
 */
const update = async (companyId, id, data, actorId, actor = null) => {
  const existingUser = await prisma.user.findFirst({
    where: { id, ...scope('user', companyId) },
  });
  if (!existingUser) {
    throw new Error('Usuario no encontrado');
  }
  if (actor) assertPuedeGestionar(actor, existingUser, { cambios: data });

  const updateData = {};
  if (data.email !== undefined) updateData.email = data.email;
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.employeeType !== undefined) updateData.employeeType = data.employeeType;
  if (data.staffCategory !== undefined) updateData.staffCategory = data.staffCategory;
  if (data.scheduledEntryTime !== undefined) {
    updateData.scheduledEntryTime = data.scheduledEntryTime;
  }
  if (data.scheduleType !== undefined) updateData.scheduleType = data.scheduleType;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  // Recalcula el valor de la hora con lo que quede vigente tras el cambio.
  const employeeType = data.employeeType ?? existingUser.employeeType;
  const monthlySalary =
    data.monthlySalary !== undefined
      ? parseFloat(data.monthlySalary)
      : parseFloat(existingUser.monthlySalary);
  const monthlyHours =
    data.monthlyHours !== undefined
      ? parseFloat(data.monthlyHours)
      : parseFloat(existingUser.monthlyHours);
  const dailyWage =
    data.dailyWage !== undefined ? parseFloat(data.dailyWage) : parseFloat(existingUser.dailyWage);

  if (data.monthlySalary !== undefined) updateData.monthlySalary = monthlySalary;
  if (data.monthlyHours !== undefined) updateData.monthlyHours = monthlyHours;
  if (data.dailyWage !== undefined) updateData.dailyWage = dailyWage;

  updateData.hourlyRate = hourlyRateFor({ employeeType, monthlySalary, monthlyHours, dailyWage });

  if (data.phone !== undefined) {
    const phone = normalizePhone(data.phone);
    if (phone && !isValidPhone(phone)) {
      throw new Error('El celular debe tener 8 dígitos y empezar en 6 o 7');
    }
    if (phone && phone !== existingUser.phone) {
      const ocupado = await prisma.user.findUnique({ where: { phone } });
      if (ocupado) throw new Error('El celular ya está registrado');
    }
    updateData.phone = phone;
  }

  // Una contraseña puesta por el administrador se considera definitiva:
  // no se fuerza el cambio, a diferencia del reseteo con contraseña temporal.
  if (data.password) {
    assertPasswordStrength(data.password);
    const salt = await bcrypt.genSalt(10);
    updateData.password = await bcrypt.hash(data.password, salt);
    updateData.mustChangePassword = false;
    updateData.passwordSetAt = new Date();
  }

  const user = await prisma.$transaction(async (tx) => {
    // Reactivar a alguien dado de baja, o convertir un ADMIN en empleado, son
    // altas efectivas: ocupan un cupo del plan igual que un empleado nuevo.
    const seraEmpleado = (updateData.role ?? existingUser.role) === 'EMPLOYEE';
    const seraActivo = updateData.isActive ?? existingUser.isActive;
    const eraEmpleadoActivo = existingUser.role === 'EMPLOYEE' && existingUser.isActive;

    if (seraEmpleado && seraActivo && !eraEmpleadoActivo) {
      await assertEmployeeQuota(tx, companyId);
    }

    await tx.user.update({
      where: { id },
      data: updateData,
      select: PUBLIC_FIELDS,
    });
    if (data.scheduleBlocks?.length) {
      await scheduleService.replaceForUser(
        tx,
        id,
        data.scheduleType || existingUser.scheduleType,
        data.scheduleBlocks,
        actorId
      );
    }
    // `select` explícito: con `include` Prisma devolvería también el hash de la contraseña.
    return tx.user.findUnique({
      where: { id },
      select: {
        ...PUBLIC_FIELDS,
        scheduleBlocks: {
          where: { isActive: true },
          orderBy: [{ dayOfWeek: 'asc' }, { blockOrder: 'asc' }],
        },
      },
    });
  });
  return user;
};

/**
 * Soft-delete a user by setting isActive to false.
 */
const softDelete = async (companyId, id, actor = null) => {
  const existingUser = await prisma.user.findFirst({
    where: { id, ...scope('user', companyId) },
  });
  if (!existingUser) {
    throw new Error('Usuario no encontrado');
  }
  if (actor) assertPuedeGestionar(actor, existingUser, { accion: 'desactivar' });

  return prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: PUBLIC_FIELDS,
  });
};

/**
 * Genera una nueva contraseña temporal y la reenvía por correo.
 * Es la vía de recuperación cuando el empleado pierde su acceso o el
 * primer correo nunca llegó.
 */
const resetPassword = async (companyId, id, actor = null) => {
  const user = await prisma.user.findFirst({
    where: { id: Number(id), ...scope('user', companyId) },
  });
  if (!user) throw new Error('Usuario no encontrado');
  if (actor) assertPuedeGestionar(actor, user, { accion: 'restablecer' });
  if (!user.isActive) throw new Error('No se puede restablecer el acceso de un usuario inactivo');
  if (!user.email && !user.phone) {
    throw new Error('Este empleado no tiene correo ni celular: no usa la aplicación');
  }

  const temporaryPassword = generateTemporaryPassword();
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(temporaryPassword, salt);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword, mustChangePassword: true, passwordSetAt: null },
  });

  const delivery = user.email
    ? await emailService.sendCredentialsEmail(user, temporaryPassword, process.env.APP_PUBLIC_URL)
    : { success: false, error: 'Sin correo: entregue la clave por mensaje' };

  const credentialState = delivery.success
    ? { credentialsSentAt: new Date(), credentialsError: null }
    : { credentialsError: delivery.error };

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: credentialState,
    select: PUBLIC_FIELDS,
  });

  return {
    ...updated,
    credentialsDelivered: delivery.success,
    temporaryPassword: delivery.success ? undefined : temporaryPassword,
  };
};

/**
 * Cambio de contraseña por parte del propio usuario. Exige la contraseña
 * actual para que un token robado no baste para secuestrar la cuenta.
 */
const changeOwnPassword = async (id, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: Number(id) } });
  if (!user) throw new Error('Usuario no encontrado');

  const isValid = await bcrypt.compare(currentPassword, user.password);
  if (!isValid) throw new Error('La contraseña actual no es correcta');

  assertPasswordStrength(newPassword);
  if (await bcrypt.compare(newPassword, user.password)) {
    throw new Error('La nueva contraseña debe ser distinta de la actual');
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(newPassword, salt);

  return prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      mustChangePassword: false,
      passwordSetAt: new Date(),
      credentialsError: null,
    },
    select: PUBLIC_FIELDS,
  });
};

module.exports = {
  getAll,
  create,
  update,
  softDelete,
  resetPassword,
  changeOwnPassword,
  assertEmployeeQuota,
  PlanLimitError,
  PUBLIC_FIELDS,
};
