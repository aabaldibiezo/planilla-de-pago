const prisma = require('../lib/prisma');
const {
  calculateDelayMinutes,
  calculateWorkedHours,
  minutes,
  boliviaNow,
} = require('../lib/business-rules');
const { evaluateLocation } = require('../lib/geofence');
const worksiteService = require('./worksite.service');
const photoService = require('./photo.service');
const { scope } = require('../lib/tenant');

// La fecha y hora de Bolivia viven en `lib/business-rules`: las usan también
// las asignaciones de sede, y tener dos copias fue lo que hizo que una
// quedara en UTC y la otra no.
const boliviaDateTime = () => {
  const { dateStr, timeStr } = boliviaNow();
  return {
    dateStr,
    timeStr,
    // Instante real, con segundos y milisegundos. Bolivia es UTC-4 fijo (sin
    // horario de verano), así que `dateStr`/`timeStr` son el mismo momento pero
    // truncado al minuto: construir el instante a partir de ellos hacía que una
    // entrada y una salida dentro del mismo minuto quedaran iguales y la salida
    // fuera rechazada por "debe ser posterior a la entrada".
    instant: new Date(),
    date: new Date(`${dateStr}T00:00:00.000Z`),
  };
};

/**
 * Registra una entrada. Elige el bloque de horario del día que mejor corresponde
 * al momento actual y calcula el retraso contra su hora de inicio.
 */
const clockInSession = async (companyId, userId, actorId, notes) => {
  const id = Number(userId);
  const now = boliviaDateTime();
  const boliviaDay = new Date(`${now.dateStr}T00:00:00.000Z`).getUTCDay();

  const user = await prisma.user.findFirst({
    where: { id, ...scope('user', companyId) },
    include: {
      scheduleBlocks: {
        where: { isActive: true, dayOfWeek: boliviaDay },
        orderBy: { blockOrder: 'asc' },
      },
    },
  });
  if (!user || !user.isActive) {
    throw new Error('El empleado seleccionado no existe');
  }

  const open = await prisma.attendanceSession.findFirst({
    where: { ...scope('attendanceSession', companyId), userId: id, clockOut: null },
  });
  if (open) {
    throw new Error('El empleado ya tiene una entrada pendiente de salida');
  }

  // Descarta los bloques que ya tienen una marcación registrada hoy.
  const sessions = await prisma.attendanceSession.findMany({
    where: { ...scope('attendanceSession', companyId), userId: id, workDate: now.date },
  });
  const available = user.scheduleBlocks.filter(
    (block) => !sessions.some((session) => session.scheduleBlockId === block.id)
  );

  // Prefiere el último bloque ya iniciado; si ninguno comenzó, toma el primero pendiente.
  const nowMinutes = minutes(now.timeStr);
  const block =
    [...available].reverse().find((candidate) => minutes(candidate.startTime) <= nowMinutes) ||
    available[0] ||
    null;

  // El retraso se mide solo contra un turno que existe. Si hoy no le toca
  // ningún bloque (trabaja un día fuera de su horario, o ya usó todos los de
  // hoy), no llegó tarde a nada: antes se comparaba contra `scheduledEntryTime`
  // y una entrada un domingo a las 18:35 sumaba 10 horas de "retraso" que se
  // descontaban del sueldo. `scheduledEntryTime` queda solo para quien no
  // tiene ningún bloque cargado, que es la configuración antigua.
  let scheduled = block?.startTime || null;
  if (!block && sessions.length === 0) {
    const bloquesCargados = await prisma.scheduleBlock.count({
      where: { userId: id, isActive: true },
    });
    if (!bloquesCargados) scheduled = user.scheduledEntryTime;
  }
  const delay = scheduled ? calculateDelayMinutes(scheduled, now.timeStr) : 0;

  return prisma.$transaction(async (tx) => {
    let attendance = await tx.attendance.findFirst({ where: { userId: id, date: now.date } });
    if (!attendance) {
      attendance = await tx.attendance.create({
        data: {
          userId: id,
          date: now.date,
          scheduledEntry: scheduled || user.scheduledEntryTime,
          actualEntry: now.timeStr,
          hoursWorked: 0,
          delayMinutes: 0,
          notes: notes || null,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
    }

    const session = await tx.attendanceSession.create({
      data: {
        userId: id,
        attendanceId: attendance.id,
        scheduleBlockId: block?.id || null,
        workDate: now.date,
        clockIn: now.instant,
        delayMinutes: delay,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    const aggregate = await tx.attendanceSession.aggregate({
      where: { attendanceId: attendance.id },
      _sum: { delayMinutes: true },
    });
    await tx.attendance.update({
      where: { id: attendance.id },
      data: { delayMinutes: aggregate._sum.delayMinutes || 0, updatedBy: actorId },
    });

    return session;
  });
};

/**
 * Error de geocerco. Lleva un código para que la aplicación distinga el motivo
 * del rechazo sin tener que interpretar el texto del mensaje.
 */
class GeofenceError extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = 'GeofenceError';
    this.code = codigo;
    this.statusCode = 422;
  }
}

/**
 * Geocerco estricto: decide si la marcación puede registrarse.
 *
 * Bloquea en los tres casos en que no hay una ubicación válida dentro del
 * radio de la sede asignada, incluido el de "sin GPS". Dejar pasar ese caso
 * anularía el control por completo, porque bastaría con negar el permiso de
 * ubicación en el teléfono.
 *
 * El mensaje devuelto nunca menciona distancias, coordenadas ni la sede:
 * el empleado solo se entera de si puede marcar o no.
 */
const evaluarGeocercoEstricto = async (
  companyId,
  userId,
  fecha,
  { latitude, longitude, accuracyMeters }
) => {
  const sedes = await worksiteService.worksitesForUserOnDate(companyId, userId, fecha);

  if (sedes.length === 0) {
    throw new GeofenceError(
      'SIN_SEDE_ASIGNADA',
      'No tiene un lugar de trabajo asignado para hoy. Avise a su supervisor.'
    );
  }

  const ubicacion = evaluateLocation({ latitude, longitude, accuracyMeters, worksites: sedes });

  if (ubicacion.status === 'UNAVAILABLE') {
    throw new GeofenceError(
      'UBICACION_NO_DISPONIBLE',
      'No se pudo obtener su ubicación. Active el GPS, salga a un lugar abierto e intente de nuevo.'
    );
  }

  if (ubicacion.status !== 'OK') {
    throw new GeofenceError(
      'FUERA_DE_ZONA',
      'No se encuentra cerca de su lugar de trabajo. No puede marcar en este momento.'
    );
  }

  return ubicacion;
};

/**
 * Marcación de entrada hecha por el propio empleado desde la app móvil.
 *
 * El orden importa: primero se valida la ubicación y recién después se guarda
 * la foto. Al revés se subirían imágenes de intentos rechazados que nadie va
 * a mirar.
 */
/**
 * La aplicación de marcaje es solo para el personal fijo. El temporal no la
 * usa: el encargado le registra el día desde el panel. Se rechaza con el
 * mismo tipo de error que el geocerco para que la app muestre el aviso.
 */
const asegurarEmpleadoFijo = async (companyId, userId) => {
  const empleado = await prisma.user.findFirst({
    where: { id: Number(userId), ...scope('user', companyId) },
    select: { employeeType: true },
  });
  if (empleado?.employeeType === 'TEMPORAL') {
    throw new GeofenceError(
      'SOLO_FIJOS',
      'La aplicación es solo para el personal fijo. Su día lo registra el encargado.'
    );
  }
};

const selfClockIn = async (
  companyId,
  userId,
  { photo, latitude, longitude, accuracyMeters, deviceInfo }
) => {
  await asegurarEmpleadoFijo(companyId, userId);
  const now = boliviaDateTime();

  const abierta = await prisma.attendanceSession.findFirst({
    where: { ...scope('attendanceSession', companyId), userId: Number(userId), clockOut: null },
  });
  if (abierta) throw new Error('Ya tiene una entrada pendiente de salida');

  if (!photo) throw new Error('La foto de la marcación es obligatoria');

  const ubicacion = await evaluarGeocercoEstricto(companyId, userId, now.date, {
    latitude,
    longitude,
    accuracyMeters,
  });

  const archivo = await photoService.storeAttendancePhoto(photo, {
    userId: Number(userId),
    workDate: now.date,
  });

  const sesion = await clockInSession(companyId, userId, Number(userId), null);

  const actualizada = await prisma.attendanceSession.update({
    where: { id: sesion.id },
    data: {
      photoUrl: archivo.url,
      photoPublicId: archivo.publicId,
      capturedLatitude: Number(latitude),
      capturedLongitude: Number(longitude),
      gpsAccuracyMeters: accuracyMeters == null ? null : Math.round(Number(accuracyMeters)),
      distanceMeters: ubicacion.distanceMeters,
      locationStatus: ubicacion.status,
      matchedWorksiteId: ubicacion.worksiteId,
      deviceInfo: deviceInfo ? String(deviceInfo).slice(0, 250) : null,
      // Con geocerco estricto solo se guarda lo que ya pasó la validación,
      // así que no hay nada pendiente de revisar.
      reviewStatus: 'NOT_REQUIRED',
    },
  });

  return actualizada;
};

/**
 * Marcación de salida hecha por el propio empleado.
 *
 * La salida se valida con el mismo geocerco estricto que la entrada: si no se
 * validara, alguien podría fichar la entrada en la sede y la salida desde su
 * casa, y las horas trabajadas quedarían infladas.
 */
const selfClockOut = async (
  companyId,
  userId,
  sessionId,
  { photo, latitude, longitude, accuracyMeters } = {}
) => {
  await asegurarEmpleadoFijo(companyId, userId);
  const sesion = await prisma.attendanceSession.findFirst({
    where: { id: Number(sessionId), ...scope('attendanceSession', companyId) },
  });
  if (!sesion) throw new Error('Marcación no encontrada');
  if (sesion.userId !== Number(userId)) {
    throw new Error('Solo puede cerrar sus propias marcaciones');
  }
  if (sesion.clockOut) throw new Error('La salida ya fue registrada');

  const ubicacion = await evaluarGeocercoEstricto(companyId, userId, sesion.workDate, {
    latitude,
    longitude,
    accuracyMeters,
  });

  // La foto de salida es opcional: la aplicación la envía, pero un
  // administrador cerrando una sesión desde el panel no tiene cómo tomarla.
  let archivo = null;
  if (photo) {
    archivo = await photoService.storeAttendancePhoto(photo, {
      userId: Number(userId),
      workDate: sesion.workDate,
    });
  }

  const cerrada = await clockOutSession(companyId, sesion.id, Number(userId));

  return prisma.attendanceSession.update({
    where: { id: cerrada.id },
    data: {
      clockOutPhotoUrl: archivo?.url ?? null,
      clockOutPhotoPublicId: archivo?.publicId ?? null,
      clockOutLatitude: Number(latitude),
      clockOutLongitude: Number(longitude),
      clockOutAccuracyMeters: accuracyMeters == null ? null : Math.round(Number(accuracyMeters)),
      clockOutDistanceMeters: ubicacion.distanceMeters,
      clockOutLocationStatus: ubicacion.status,
    },
  });
};

/**
 * Registro manual hecho por un administrador.
 *
 * Es la contrapartida necesaria del bloqueo estricto: sin esta vía, un
 * empleado en un sótano sin señal no tendría forma de que le registren la
 * jornada. Exige un motivo escrito y queda marcado como manual.
 */
const manualClockIn = async (companyId, userId, actorId, motivo) => {
  if (!motivo || String(motivo).trim().length < 5) {
    throw new Error('Debe indicar el motivo del registro manual');
  }

  const abierta = await prisma.attendanceSession.findFirst({
    where: { ...scope('attendanceSession', companyId), userId: Number(userId), clockOut: null },
  });
  if (abierta) throw new Error('El empleado ya tiene una entrada pendiente de salida');

  const sesion = await clockInSession(companyId, userId, actorId, null);

  return prisma.attendanceSession.update({
    where: { id: sesion.id },
    data: {
      registeredManually: true,
      manualReason: String(motivo).trim().slice(0, 500),
      locationStatus: 'NOT_REQUIRED',
      reviewStatus: 'NOT_REQUIRED',
    },
  });
};

/**
 * Día trabajado de un temporal, cargado de una vez por el encargado.
 *
 * El temporal suele venir un día, cobra ese día y no vuelve: no tiene la
 * aplicación ni horario. El encargado registra entrada y salida juntas, aunque
 * sea después (al final del día o al otro día). Solo para TEMPORAL: a un fijo
 * se le marca con su propia app o con el registro manual, que deja motivo.
 */
const registerWorkedDay = async (
  companyId,
  userId,
  { date, startTime, endTime, worksiteId },
  actorId
) => {
  // El día queda atado a la sede donde trabajó: sin eso no se sabe a qué
  // lugar (ni a qué cliente) corresponde, y la boleta sale "sin sede".
  if (!worksiteId) throw new Error('Elija la sede donde trabajó');
  const sede = await prisma.worksite.findFirst({
    where: { id: Number(worksiteId), ...scope('worksite', companyId), isActive: true },
  });
  if (!sede) throw new Error('La sede elegida no existe o está desactivada');

  const user = await prisma.user.findFirst({
    where: { id: Number(userId), ...scope('user', companyId) },
  });
  if (!user || !user.isActive) throw new Error('El empleado seleccionado no existe');
  if (user.employeeType !== 'TEMPORAL') {
    throw new Error('Solo se carga así el día de un temporal');
  }

  const workDate = new Date(`${date}T00:00:00.000Z`);
  if (workDate > new Date(`${boliviaDateTime().dateStr}T00:00:00.000Z`)) {
    throw new Error('No se puede registrar un día que todavía no llegó');
  }

  const repetido = await prisma.attendanceSession.findFirst({
    where: { ...scope('attendanceSession', companyId), userId: user.id, workDate },
  });
  if (repetido) throw new Error('Ese día ya está registrado para esta persona');

  // Bolivia es UTC-4 fijo. Si la salida es menor que la entrada, terminó al
  // día siguiente.
  const clockIn = new Date(`${date}T${startTime}:00.000-04:00`);
  let clockOut = new Date(`${date}T${endTime}:00.000-04:00`);
  if (clockOut <= clockIn) clockOut = new Date(clockOut.getTime() + 24 * 60 * 60 * 1000);
  const worked = Math.round((clockOut - clockIn) / 60000);

  return prisma.$transaction(async (tx) => {
    const attendance = await tx.attendance.create({
      data: {
        userId: user.id,
        date: workDate,
        scheduledEntry: startTime,
        actualEntry: startTime,
        actualExit: endTime,
        hoursWorked: Number((worked / 60).toFixed(2)),
        delayMinutes: 0,
        notes: 'Día de temporal registrado por el encargado',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    return tx.attendanceSession.create({
      data: {
        userId: user.id,
        attendanceId: attendance.id,
        workDate,
        clockIn,
        clockOut,
        workedMinutes: worked,
        delayMinutes: 0,
        registeredManually: true,
        manualReason: 'Día de temporal registrado por el encargado',
        matchedWorksiteId: sede.id,
        locationStatus: 'NOT_REQUIRED',
        reviewStatus: 'NOT_REQUIRED',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  });
};

/**
 * Marcación abierta del empleado, si la tiene. La app la usa para saber si
 * debe ofrecer "Marcar entrada" o "Marcar salida".
 */
const openSessionFor = (companyId, userId) =>
  prisma.attendanceSession.findFirst({
    where: { ...scope('attendanceSession', companyId), userId: Number(userId), clockOut: null },
    select: { id: true, clockIn: true, workDate: true },
    orderBy: { clockIn: 'desc' },
  });

/**
 * Bandeja de marcaciones señaladas como sospechosas, para el administrador.
 */
const listForReview = (companyId, filters = {}) =>
  prisma.attendanceSession.findMany({
    where: {
      ...scope('attendanceSession', companyId),
      ...(filters.status ? { reviewStatus: filters.status } : { reviewStatus: 'PENDING' }),
      ...(filters.userId && { userId: Number(filters.userId) }),
    },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      matchedWorksite: { select: { id: true, name: true, address: true, radiusMeters: true } },
    },
    orderBy: { clockIn: 'desc' },
    take: 200,
  });

/**
 * Decisión del administrador sobre una marcación sospechosa.
 */
const reviewSession = async (companyId, sessionId, { status, notes }, actorId) => {
  const sesion = await prisma.attendanceSession.findFirst({
    where: { id: Number(sessionId), ...scope('attendanceSession', companyId) },
  });
  if (!sesion) throw new Error('Marcación no encontrada');
  if (sesion.reviewStatus !== 'PENDING') {
    throw new Error('Solo se puede revisar una marcación pendiente');
  }

  return prisma.attendanceSession.update({
    where: { id: sesion.id },
    data: {
      reviewStatus: status,
      reviewedBy: actorId,
      reviewedAt: new Date(),
      reviewNotes: notes || null,
      updatedBy: actorId,
    },
  });
};

/**
 * Registra la salida de una marcación abierta y reagrega los totales del día.
 */
const clockOutSession = async (companyId, id, actorId) => {
  const current = await prisma.attendanceSession.findFirst({
    where: { id: Number(id), ...scope('attendanceSession', companyId) },
  });
  if (!current) throw new Error('Marcación no encontrada');
  if (current.clockOut) throw new Error('La salida ya fue registrada');

  const now = boliviaDateTime();
  if (now.instant <= current.clockIn) {
    throw new Error('La salida debe ser posterior a la entrada');
  }

  const worked = Math.round((now.instant - current.clockIn) / 60000);

  return prisma.$transaction(async (tx) => {
    const session = await tx.attendanceSession.update({
      where: { id: current.id },
      data: { clockOut: now.instant, workedMinutes: worked, updatedBy: actorId },
    });

    const totals = await tx.attendanceSession.aggregate({
      where: { attendanceId: current.attendanceId },
      _sum: { workedMinutes: true, delayMinutes: true },
    });
    await tx.attendance.update({
      where: { id: current.attendanceId },
      data: {
        actualExit: now.timeStr,
        hoursWorked: Number(((totals._sum.workedMinutes || 0) / 60).toFixed(2)),
        delayMinutes: totals._sum.delayMinutes || 0,
        updatedBy: actorId,
      },
    });

    return session;
  });
};

const justifySession = async (companyId, id, data, actorId) => {
  const session = await prisma.attendanceSession.findFirst({
    where: { id: Number(id), ...scope('attendanceSession', companyId) },
  });
  if (!session) throw new Error('Marcación de asistencia no encontrada');
  if (session.delayMinutes <= 0) throw new Error('La marcación no tiene retraso para justificar');

  const now = new Date();
  return prisma.attendanceSession.update({
    where: { id: session.id },
    data: {
      justificationStatus: data.status,
      justificationReason: data.reason,
      justificationNotes: data.notes || null,
      justificationRequestedAt: session.justificationRequestedAt || now,
      justificationCreatedBy: session.justificationCreatedBy || actorId,
      justificationReviewedBy: actorId,
      justificationReviewedAt: now,
      decisionReason: data.decisionReason || data.reason,
      updatedBy: actorId,
    },
  });
};

/**
 * Create or update an attendance record (for Entry/notes).
 * Force current server time in Bolivia timezone for new entries.
 * For updates, only allow modifying notes (locked date and time).
 */
const upsert = async (companyId, data) => {
  const userId = parseInt(data.userId, 10);

  // Find employee to get scheduledEntryTime
  const user = await prisma.user.findFirst({
    where: { id: userId, ...scope('user', companyId) },
  });
  if (!user) {
    throw new Error('El empleado seleccionado no existe');
  }

  let existing = null;

  if (data.date) {
    const inputDate = new Date(data.date);
    const normalizedInputDate = new Date(
      Date.UTC(inputDate.getUTCFullYear(), inputDate.getUTCMonth(), inputDate.getUTCDate())
    );

    existing = await prisma.attendance.findFirst({
      where: {
        ...scope('attendance', companyId),
        userId,
        date: normalizedInputDate,
      },
    });
  }

  if (existing) {
    // UPDATE: Only allow updating the notes field. Date, entry/exit times, and delays are LOCKED.
    return prisma.attendance.update({
      where: { id: existing.id },
      data: {
        notes: data.notes !== undefined ? data.notes : existing.notes,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            scheduledEntryTime: true,
          },
        },
      },
    });
  } else {
    // NEW REGISTRATION: Enforce current server time in Bolivia timezone (CLOCK IN)
    const { dateStr, timeStr } = boliviaNow();

    const scheduledEntry = user.scheduledEntryTime || '08:00';
    const actualEntry = timeStr;
    const delayMinutes = calculateDelayMinutes(scheduledEntry, actualEntry);

    const serverDate = new Date(dateStr);
    const normalizedServerDate = new Date(
      Date.UTC(serverDate.getFullYear(), serverDate.getMonth(), serverDate.getDate())
    );

    // Check again if we already have an entry for today (to prevent duplicates)
    const duplicateCheck = await prisma.attendance.findFirst({
      where: {
        ...scope('attendance', companyId),
        userId,
        date: normalizedServerDate,
      },
    });

    if (duplicateCheck) {
      // If it exists, update notes only
      return prisma.attendance.update({
        where: { id: duplicateCheck.id },
        data: {
          notes: data.notes !== undefined ? data.notes : duplicateCheck.notes,
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              scheduledEntryTime: true,
            },
          },
        },
      });
    }

    return prisma.attendance.create({
      data: {
        userId,
        date: normalizedServerDate,
        scheduledEntry,
        actualEntry,
        actualExit: null,
        hoursWorked: 0,
        delayMinutes,
        notes: data.notes || null,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            scheduledEntryTime: true,
          },
        },
      },
    });
  }
};

/**
 * Get all attendance records with optional filtering.
 */
const getAll = async (companyId, filters) => {
  const where = { ...scope('attendance', companyId) };

  if (filters.userId) {
    where.userId = parseInt(filters.userId, 10);
  }

  if (filters.month && filters.year) {
    const month = parseInt(filters.month, 10);
    const year = parseInt(filters.year, 10);

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    where.date = {
      gte: startDate,
      lte: endDate,
    };
  }

  const attendances = await prisma.attendance.findMany({
    where,
    include: {
      sessions: { orderBy: { clockIn: 'asc' } },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeType: true,
          scheduledEntryTime: true,
        },
      },
    },
    orderBy: { date: 'desc' },
  });

  const reviewerIds = [
    ...new Set(
      attendances
        .flatMap((attendance) => attendance.sessions)
        .map((session) => session.justificationReviewedBy)
        .filter(Boolean)
    ),
  ];

  if (reviewerIds.length === 0) return attendances;

  const reviewers = await prisma.user.findMany({
    where: { id: { in: reviewerIds }, ...scope('user', companyId) },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  const reviewersById = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer]));

  return attendances.map((attendance) => ({
    ...attendance,
    sessions: attendance.sessions.map((session) => ({
      ...session,
      justificationReviewedByUser: reviewersById.get(session.justificationReviewedBy) || null,
    })),
  }));
};

/**
 * Get summary of delays and worked hours for a user in a given month.
 */
const getMonthlySummary = async (companyId, userId, month, year) => {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const attendances = await prisma.attendance.findMany({
    where: {
      ...scope('attendance', companyId),
      userId: parseInt(userId, 10),
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const totalDelayMinutes = attendances.reduce((sum, att) => sum + att.delayMinutes, 0);
  const totalHoursWorked = attendances.reduce((sum, att) => sum + parseFloat(att.hoursWorked), 0);

  return {
    totalDelayMinutes,
    totalDelayHours: parseFloat((totalDelayMinutes / 60).toFixed(2)),
    totalHoursWorked: parseFloat(totalHoursWorked.toFixed(2)),
    daysAttended: attendances.length,
  };
};

module.exports = {
  upsert,
  getAll,
  getMonthlySummary,
  calculateDelayMinutes,
  calculateWorkedHours,
  clockInSession,
  clockOutSession,
  justifySession,
  selfClockIn,
  selfClockOut,
  manualClockIn,
  registerWorkedDay,
  openSessionFor,
  listForReview,
  reviewSession,
  GeofenceError,
};
