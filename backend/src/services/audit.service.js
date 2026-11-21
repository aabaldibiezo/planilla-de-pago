const prisma = require('../lib/prisma');
const { scope } = require('../lib/tenant');

const REDACTED_KEYS = ['password', 'token', 'jwt', 'authorization'];

/** Clona el valor para la auditoría, serializando BigInt y ocultando datos sensibles. */
const sanitize = (value) => {
  if (!value) return value;

  const clone = JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item))
  );

  REDACTED_KEYS.forEach((key) => {
    if (clone[key]) clone[key] = '[REDACTED]';
  });

  return clone;
};

const record = (req, data) => {
  // Avisa al registro de actividad que esta acción ya quedó registrada con
  // detalle, para no anotarla dos veces.
  if (req) req.auditado = true;
  return prisma.auditLog.create({
    data: {
      // null solo en acciones de plataforma (súper administrador), que no
      // pertenecen a ninguna empresa cliente.
      companyId: req.user?.companyId ?? null,
      actorId: req.user?.id || null,
      action: data.action,
      entity: data.entity,
      entityId: String(data.entityId),
      employeeId: data.employeeId || null,
      reason: data.reason || null,
      previousData: sanitize(data.previousData),
      newData: sanitize(data.newData),
      ipAddress: req.ip || null,
      userAgent: req.get('user-agent') || null,
    },
  });
};

const list = (companyId, filters) => {
  const where = { ...scope('auditLog', companyId) };
  if (filters.actorId) where.actorId = Number(filters.actorId);
  if (filters.employeeId) where.employeeId = Number(filters.employeeId);
  if (filters.action) where.action = filters.action;
  if (filters.entity) where.entity = filters.entity;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from && { gte: new Date(filters.from) }),
      ...(filters.to && { lte: new Date(`${filters.to}T23:59:59.999Z`) }),
    };
  }

  return prisma.auditLog.findMany({
    where,
    include: { actor: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
};

module.exports = { record, list, sanitize };
