const prisma = require('../lib/prisma');
const {
  dateOnly,
  durationHours,
  interval,
  overlaps,
  overtimeAmount,
} = require('../lib/business-rules');
const { scope } = require('../lib/tenant');

/**
 * Verifica que una hora extra no se solape con otra activa del mismo empleado
 * ni con su horario ordinario para ese día.
 */
const assertNoConflict = async (tx, companyId, input, excludeId) => {
  const userId = Number(input.userId);
  const workDate = dateOnly(input.workDate);
  const candidate = interval(input.startTime, input.endTime);

  const existing = await tx.overtime.findMany({
    where: {
      ...scope('overtime', companyId),
      userId,
      workDate,
      status: { notIn: ['REJECTED', 'CANCELLED'] },
      ...(excludeId && { id: { not: Number(excludeId) } }),
    },
  });
  if (existing.some((row) => overlaps(candidate, interval(row.startTime, row.endTime)))) {
    throw new Error('La hora extra se solapa con otro registro activo del empleado');
  }

  const blocks = await tx.scheduleBlock.findMany({
    where: {
      ...scope('scheduleBlock', companyId),
      userId,
      dayOfWeek: workDate.getUTCDay(),
      isActive: true,
    },
  });
  if (blocks.some((block) => overlaps(candidate, interval(block.startTime, block.endTime)))) {
    throw new Error('La hora extra se solapa con el horario ordinario del empleado');
  }
};

const createOvertime = async (companyId, input, actorId) => {
  const user = await prisma.user.findFirst({
    where: { id: Number(input.userId), ...scope('user', companyId) },
  });
  if (!user || !user.isActive || user.role !== 'EMPLOYEE') {
    throw new Error('Empleado no encontrado o inactivo');
  }

  const hours = durationHours(input.startTime, input.endTime);
  const amount = overtimeAmount(user, input, hours);

  return prisma.$transaction(async (tx) => {
    await assertNoConflict(tx, companyId, { ...input, userId: user.id });

    return tx.overtime.create({
      data: {
        userId: user.id,
        workDate: dateOnly(input.workDate),
        startTime: input.startTime,
        endTime: input.endTime,
        hours,
        reason: input.reason,
        status: 'PENDING',
        paymentMode: input.paymentMode,
        hourlyRateSnapshot: user.hourlyRate,
        multiplier: Number(input.multiplier ?? 1),
        fixedAmount: input.fixedAmount == null ? null : Number(input.fixedAmount),
        calculatedAmount: amount,
        notes: input.notes || null,
        requestedBy: actorId,
      },
    });
  });
};

const approveOvertime = (companyId, id, status, actorId) =>
  prisma.$transaction(async (tx) => {
    const current = await tx.overtime.findFirst({
      where: { id: Number(id), ...scope('overtime', companyId) },
    });
    if (!current) throw new Error('Hora extra no encontrada');
    if (current.status !== 'PENDING') {
      throw new Error('Solo se puede decidir una hora extra pendiente');
    }

    const row = await tx.overtime.update({
      where: { id: current.id },
      data: { status, approvedBy: actorId, approvedAt: new Date() },
    });

    // Las horas extra compensadas con tiempo libre generan una bolsa de horas.
    if (status === 'APPROVED' && row.paymentMode === 'TIME_OFF') {
      const existing = await tx.timeCompensation.findFirst({ where: { overtimeId: row.id } });
      if (!existing) {
        await tx.timeCompensation.create({
          data: {
            userId: row.userId,
            overtimeId: row.id,
            generatedHours: row.hours,
            remainingHours: row.hours,
            generatedAt: new Date(),
            reason: row.reason,
            authorizedBy: actorId,
            notes: row.notes,
          },
        });
      }
    }

    return row;
  });

const updateOvertime = async (companyId, id, input) =>
  prisma.$transaction(async (tx) => {
    const current = await tx.overtime.findFirst({
      where: { id: Number(id), ...scope('overtime', companyId) },
    });
    if (!current) throw new Error('Hora extra no encontrada');
    if (current.status !== 'PENDING') {
      throw new Error('Solo se pueden editar horas extra pendientes');
    }

    const userId = input.userId == null ? current.userId : Number(input.userId);
    const user = await tx.user.findFirst({ where: { id: userId, ...scope('user', companyId) } });
    if (!user || !user.isActive || user.role !== 'EMPLOYEE') {
      throw new Error('Empleado no encontrado o inactivo');
    }

    const startTime = input.startTime || current.startTime;
    const endTime = input.endTime || current.endTime;
    const paymentMode = input.paymentMode || current.paymentMode;
    const hours = durationHours(startTime, endTime);
    const amount = overtimeAmount(
      user,
      {
        paymentMode,
        multiplier: input.multiplier ?? current.multiplier,
        fixedAmount: input.fixedAmount ?? current.fixedAmount,
      },
      hours
    );

    await assertNoConflict(
      tx,
      companyId,
      { userId, workDate: input.workDate || current.workDate, startTime, endTime },
      current.id
    );

    let fixedAmount = current.fixedAmount;
    if (input.fixedAmount !== undefined) {
      fixedAmount = input.fixedAmount == null ? null : Number(input.fixedAmount);
    }

    return tx.overtime.update({
      where: { id: current.id },
      data: {
        userId,
        workDate: input.workDate ? dateOnly(input.workDate) : current.workDate,
        startTime,
        endTime,
        hours,
        reason: input.reason || current.reason,
        paymentMode,
        multiplier: input.multiplier == null ? current.multiplier : Number(input.multiplier),
        fixedAmount,
        hourlyRateSnapshot: user.hourlyRate,
        calculatedAmount: amount,
        notes: input.notes === undefined ? current.notes : input.notes || null,
      },
    });
  });

const removeOvertime = async (companyId, id) => {
  const current = await prisma.overtime.findFirst({
    where: { id: Number(id), ...scope('overtime', companyId) },
  });
  if (!current) throw new Error('Hora extra no encontrada');
  if (current.status !== 'PENDING') {
    throw new Error('Solo se pueden eliminar horas extra pendientes');
  }

  await prisma.overtime.delete({ where: { id: current.id } });
  return current;
};

const createDiscount = async (companyId, input, actorId) => {
  const user = await prisma.user.findFirst({
    where: { id: Number(input.userId), ...scope('user', companyId) },
  });
  if (!user || !user.isActive || user.role !== 'EMPLOYEE') {
    throw new Error('Empleado no encontrado o inactivo');
  }
  if (input.type === 'UNJUSTIFIED_DELAY') {
    throw new Error('Los retrasos se descuentan automáticamente y no deben duplicarse manualmente');
  }

  return prisma.discount.create({
    data: {
      userId: user.id,
      type: input.type,
      amount: Number(input.amount),
      discountDate: dateOnly(input.discountDate),
      description: input.description,
      status: 'PENDING',
      createdBy: actorId,
      notes: input.notes || null,
      documentReference: input.documentReference || null,
    },
  });
};

const approveDiscount = (companyId, id, status, actorId) =>
  prisma.$transaction(async (tx) => {
    const current = await tx.discount.findFirst({
      where: { id: Number(id), ...scope('discount', companyId) },
    });
    if (!current) throw new Error('Descuento no encontrado');
    if (current.status !== 'PENDING' || current.paymentId) {
      throw new Error('Solo se puede decidir un descuento pendiente y no aplicado');
    }

    return tx.discount.update({
      where: { id: current.id },
      data: { status, approvedBy: actorId, approvedAt: new Date() },
    });
  });

const useCompensation = (companyId, id, hours, actorId, notes) =>
  prisma.$transaction(async (tx) => {
    const row = await tx.timeCompensation.findFirst({
      where: { id: Number(id), ...scope('timeCompensation', companyId) },
    });
    if (!row) throw new Error('Compensación no encontrada');
    if (!['AVAILABLE', 'PARTIALLY_USED'].includes(row.status)) {
      throw new Error('La compensación ya no está disponible');
    }

    const use = Number(hours);
    const remaining = Number(row.remainingHours);
    if (!Number.isFinite(use) || use <= 0 || use > remaining) {
      throw new Error('No puede utilizar más horas que el saldo disponible');
    }

    const newRemaining = Number((remaining - use).toFixed(2));
    return tx.timeCompensation.update({
      where: { id: row.id },
      data: {
        usedHours: Number((Number(row.usedHours) + use).toFixed(2)),
        remainingHours: newRemaining,
        usedAt: new Date(),
        authorizedBy: actorId,
        notes: notes || row.notes,
        status: newRemaining === 0 ? 'USED' : 'PARTIALLY_USED',
      },
    });
  });

/**
 * Listado genérico de horas extra, descuentos o compensaciones.
 * Para horas extra resuelve además quién aprobó y a qué pago quedó asociada.
 */
const list = async (companyId, model, filters = {}) => {
  // `model` es el nombre del modelo de Prisma, así que `scope` lo resuelve
  // directamente. Si mañana se lista un modelo sin ámbito definido, lanza en
  // vez de devolver las filas de todas las empresas.
  const where = { ...scope(model, companyId) };
  if (filters.userId) where.userId = Number(filters.userId);
  if (filters.status) where.status = filters.status;

  const rows = await prisma[model].findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true } },
      ...(model === 'overtime' && { paymentDetails: { select: { paymentId: true } } }),
    },
  });

  if (model !== 'overtime') return rows;

  const approverIds = [...new Set(rows.map((row) => row.approvedBy).filter(Boolean))];
  const approvers = approverIds.length
    ? await prisma.user.findMany({
        where: { id: { in: approverIds }, ...scope('user', companyId) },
        select: { id: true, firstName: true, lastName: true, email: true },
      })
    : [];
  const approversById = new Map(approvers.map((user) => [user.id, user]));

  return rows.map((row) => ({
    ...row,
    approvedByUser: approversById.get(row.approvedBy) || null,
    paymentId: row.paymentDetails[0]?.paymentId || null,
  }));
};

module.exports = {
  createOvertime,
  updateOvertime,
  removeOvertime,
  approveOvertime,
  createDiscount,
  approveDiscount,
  useCompensation,
  list,
  durationHours,
  overtimeAmount,
};
