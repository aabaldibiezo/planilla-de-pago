const prisma = require('../lib/prisma');
const { worksitesForDate, isValidCoordinate } = require('../lib/geofence');
const { boliviaToday } = require('../lib/business-rules');
const { scope } = require('../lib/tenant');
const {
  findConflict,
  describeConflict,
  dentroDeLaJornada,
} = require('../lib/assignment-schedule');

/**
 * Sedes de trabajo y asignaciones rotativas de empleados.
 *
 * Toda función recibe `companyId` como primer argumento: las sedes de una
 * empresa nunca deben ser visibles ni modificables desde otra. Las búsquedas
 * por id usan `findFirst` en vez de `findUnique` porque `findUnique` no admite
 * filtros de relación, y sin el filtro bastaría con adivinar un id ajeno.
 */

const assertCoordinates = (latitude, longitude) => {
  if (!isValidCoordinate(Number(latitude), Number(longitude))) {
    throw new Error('Las coordenadas de la sede no son válidas');
  }
};

const list = (companyId, filters = {}) =>
  prisma.worksite.findMany({
    where: {
      ...scope('worksite', companyId),
      ...(filters.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: 'asc' },
  });

const create = async (companyId, data, actorId) => {
  assertCoordinates(data.latitude, data.longitude);

  return prisma.worksite.create({
    data: {
      companyId,
      name: data.name,
      address: data.address,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      radiusMeters: Number(data.radiusMeters ?? 150),
      notes: data.notes || null,
      createdBy: actorId,
      updatedBy: actorId,
    },
  });
};

const update = async (companyId, id, data, actorId) => {
  const existente = await prisma.worksite.findFirst({
    where: { id: Number(id), ...scope('worksite', companyId) },
  });
  if (!existente) throw new Error('Sede no encontrada');

  const latitude = data.latitude === undefined ? existente.latitude : Number(data.latitude);
  const longitude = data.longitude === undefined ? existente.longitude : Number(data.longitude);
  assertCoordinates(latitude, longitude);

  return prisma.worksite.update({
    where: { id: existente.id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.address !== undefined && { address: data.address }),
      ...(data.latitude !== undefined && { latitude }),
      ...(data.longitude !== undefined && { longitude }),
      ...(data.radiusMeters !== undefined && { radiusMeters: Number(data.radiusMeters) }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
      ...(data.isActive !== undefined && { isActive: Boolean(data.isActive) }),
      updatedBy: actorId,
    },
  });
};

const remove = async (companyId, id) => {
  const existente = await prisma.worksite.findFirst({
    where: { id: Number(id), ...scope('worksite', companyId) },
  });
  if (!existente) throw new Error('Sede no encontrada');

  // Baja lógica: las marcaciones históricas siguen apuntando a esta sede.
  return prisma.worksite.update({ where: { id: existente.id }, data: { isActive: false } });
};

// --------------- Asignaciones ---------------

const listAssignments = (companyId, filters = {}) =>
  prisma.worksiteAssignment.findMany({
    where: {
      ...scope('worksiteAssignment', companyId),
      ...(filters.userId && { userId: Number(filters.userId) }),
      ...(filters.worksiteId && { worksiteId: Number(filters.worksiteId) }),
      ...(filters.includeInactive ? {} : { isActive: true }),
    },
    include: {
      worksite: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ userId: 'asc' }, { dayOfWeek: 'asc' }],
  });

/**
 * Conflicto de horario al asignar una sede. Lleva código propio para que el
 * cliente distinga este caso sin analizar el texto, igual que `GeofenceError`.
 */
class WorksiteScheduleConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WorksiteScheduleConflictError';
    this.code = 'WORKSITE_SCHEDULE_CONFLICT';
    this.statusCode = 409;
  }
}

/**
 * Impide que un empleado quede asignado a dos sedes a la vez.
 *
 * Se ejecuta dentro de la transacción del alta, para que dos altas simultáneas
 * no se cuelen ambas leyendo el mismo estado previo.
 */
const assertNoWorksiteOverlap = async (tx, companyId, empleado, candidata, excluirId) => {
  const existentes = await tx.worksiteAssignment.findMany({
    where: {
      ...scope('worksiteAssignment', companyId),
      userId: empleado.id,
      isActive: true,
      ...(excluirId ? { id: { not: Number(excluirId) } } : {}),
    },
    include: { worksite: { select: { id: true, name: true } } },
  });

  const conflicto = findConflict({ ...candidata, id: excluirId ?? null }, existentes);
  if (conflicto) {
    throw new WorksiteScheduleConflictError(
      describeConflict(`${empleado.firstName} ${empleado.lastName}`, conflicto)
    );
  }

  // Segunda regla: la franja debe caer dentro de la jornada del empleado.
  // Acá `ScheduleBlock` sí cumple su papel, porque define las horas de la
  // persona, no las de la sede.
  if (candidata.startTime && candidata.endTime && candidata.dayOfWeek != null) {
    const bloques = await tx.scheduleBlock.findMany({
      where: { userId: empleado.id, dayOfWeek: Number(candidata.dayOfWeek), isActive: true },
      select: { startTime: true, endTime: true },
    });

    if (!dentroDeLaJornada(candidata, bloques)) {
      const jornada = bloques.map((b) => `${b.startTime}-${b.endTime}`).join(', ');
      throw new WorksiteScheduleConflictError(
        `El horario ${candidata.startTime}-${candidata.endTime} queda fuera de la jornada de ` +
          `${empleado.firstName} ${empleado.lastName} ese día (${jornada}).`
      );
    }
  }
};

const createAssignment = async (companyId, data, actorId) => {
  // Empleado y sede se buscan ya acotados: asignar un empleado propio a una
  // sede ajena, o al revés, filtraría datos entre empresas.
  const empleado = await prisma.user.findFirst({
    where: { id: Number(data.userId), ...scope('user', companyId) },
  });
  if (!empleado || !empleado.isActive) throw new Error('Empleado no encontrado o inactivo');

  const sede = await prisma.worksite.findFirst({
    where: { id: Number(data.worksiteId), ...scope('worksite', companyId) },
  });
  if (!sede || !sede.isActive) throw new Error('Sede no encontrada o inactiva');

  const tieneDia = data.dayOfWeek !== undefined && data.dayOfWeek !== null;
  const tieneFecha = Boolean(data.specificDate);

  // Una asignación es recurrente (día de la semana) o puntual (fecha), no ambas.
  if (tieneDia === tieneFecha) {
    throw new Error('Indique un día de la semana o una fecha puntual, pero no ambos');
  }
  if (tieneDia && (Number(data.dayOfWeek) < 0 || Number(data.dayOfWeek) > 6)) {
    throw new Error('El día de la semana no es válido');
  }

  if (Boolean(data.startTime) !== Boolean(data.endTime)) {
    throw new Error('Indique la hora de entrada y la de salida, o ninguna de las dos');
  }

  const nueva = {
    userId: empleado.id,
    worksiteId: sede.id,
    dayOfWeek: tieneDia ? Number(data.dayOfWeek) : null,
    specificDate: tieneFecha
      ? new Date(`${String(data.specificDate).slice(0, 10)}T00:00:00.000Z`)
      : null,
    startTime: data.startTime || null,
    endTime: data.endTime || null,
    // Por defecto, vigente desde hoy en hora de Bolivia. Usar `toISOString()`
    // acá haría que una asignación creada de noche empezara recién mañana.
    validFrom: data.validFrom
      ? new Date(`${String(data.validFrom).slice(0, 10)}T00:00:00.000Z`)
      : boliviaToday(),
    validUntil: data.validUntil
      ? new Date(`${String(data.validUntil).slice(0, 10)}T00:00:00.000Z`)
      : null,
  };

  // La comprobación va dentro de la transacción: dos altas simultáneas podrían
  // pasar ambas si cada una leyera el estado anterior a la otra.
  return prisma.$transaction(async (tx) => {
    await assertNoWorksiteOverlap(tx, companyId, empleado, nueva);

    return tx.worksiteAssignment.create({
      data: { ...nueva, createdBy: actorId, updatedBy: actorId },
      include: { worksite: true },
    });
  });
};

/**
 * Cruces de horario que ya existen en los datos.
 *
 * La validación solo frena altas nuevas: las asignaciones cargadas antes de
 * que existiera la regla siguen ahí, y muchas no tienen horario (lo que las
 * vuelve jornada completa y las hace chocar entre sí). Esto las muestra para
 * que el administrador decida, sin tocar nada.
 */
const listAssignmentConflicts = async (companyId) => {
  const asignaciones = await prisma.worksiteAssignment.findMany({
    where: { ...scope('worksiteAssignment', companyId), isActive: true },
    include: {
      worksite: { select: { id: true, name: true } },
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: [{ userId: 'asc' }, { dayOfWeek: 'asc' }],
  });

  const porEmpleado = new Map();
  asignaciones.forEach((asignacion) => {
    if (!porEmpleado.has(asignacion.userId)) porEmpleado.set(asignacion.userId, []);
    porEmpleado.get(asignacion.userId).push(asignacion);
  });

  const conflictos = [];
  porEmpleado.forEach((delEmpleado) => {
    delEmpleado.forEach((candidata, indice) => {
      // Solo se mira hacia adelante: si A choca con B, no hace falta volver a
      // reportar que B choca con A.
      const conflicto = findConflict(candidata, delEmpleado.slice(indice + 1));
      if (!conflicto) return;

      conflictos.push({
        employee: `${candidata.user.firstName} ${candidata.user.lastName}`,
        userId: candidata.userId,
        assignmentId: candidata.id,
        conflictsWithId: conflicto.id,
        worksites: [candidata.worksite?.name, conflicto.worksite?.name],
        detail: describeConflict(
          `${candidata.user.firstName} ${candidata.user.lastName}`,
          conflicto
        ),
      });
    });
  });

  return { count: conflictos.length, conflicts: conflictos };
};

const removeAssignment = async (companyId, id) => {
  const existente = await prisma.worksiteAssignment.findFirst({
    where: { id: Number(id), ...scope('worksiteAssignment', companyId) },
  });
  if (!existente) throw new Error('Asignación no encontrada');

  return prisma.worksiteAssignment.update({
    where: { id: existente.id },
    data: { isActive: false },
  });
};

/**
 * Sedes vigentes para un empleado en una fecha dada.
 *
 * Se usa exclusivamente en el servidor: estas coordenadas nunca se envían
 * al dispositivo del empleado.
 */
const worksitesForUserOnDate = async (companyId, userId, date) => {
  const asignaciones = await prisma.worksiteAssignment.findMany({
    where: {
      ...scope('worksiteAssignment', companyId),
      userId: Number(userId),
      isActive: true,
    },
    include: { worksite: true },
  });

  return worksitesForDate(
    asignaciones.filter((asignacion) => asignacion.worksite?.isActive),
    date
  );
};

/**
 * Empleados activos que hoy NO tienen sede vigente.
 *
 * Con geocerco estricto, esas personas no van a poder marcar asistencia, así
 * que el panel necesita avisarlo antes de que llegue el turno.
 *
 * Se resuelve en el servidor a propósito: las reglas de vigencia (validFrom,
 * validUntil, fecha puntual con prioridad sobre el día recurrente) ya viven
 * en `lib/geofence`, y recalcularlas en el navegador abriría la puerta a que
 * la alerta y el geocerco discrepen.
 */
const employeesWithoutWorksiteToday = async (companyId) => {
  const hoy = boliviaToday();

  const empleados = await prisma.user.findMany({
    // Sin correo ni celular es un temporal que marca el encargado: no usa la
    // app, así que no necesita sede para poder marcar.
    where: {
      ...scope('user', companyId),
      role: 'EMPLOYEE',
      isActive: true,
      OR: [{ email: { not: null } }, { phone: { not: null } }],
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { lastName: 'asc' },
  });

  const asignaciones = await prisma.worksiteAssignment.findMany({
    where: { ...scope('worksiteAssignment', companyId), isActive: true },
    include: { worksite: true },
  });

  const porEmpleado = new Map();
  asignaciones.forEach((asignacion) => {
    if (!asignacion.worksite?.isActive) return;
    if (!porEmpleado.has(asignacion.userId)) porEmpleado.set(asignacion.userId, []);
    porEmpleado.get(asignacion.userId).push(asignacion);
  });

  const sinSede = empleados.filter(
    (empleado) => worksitesForDate(porEmpleado.get(empleado.id) || [], hoy).length === 0
  );

  return { date: hoy.toISOString().slice(0, 10), count: sinSede.length, employees: sinSede };
};

module.exports = {
  list,
  create,
  update,
  remove,
  listAssignments,
  createAssignment,
  removeAssignment,
  worksitesForUserOnDate,
  employeesWithoutWorksiteToday,
  listAssignmentConflicts,
  WorksiteScheduleConflictError,
};
