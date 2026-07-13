const prisma = require('../lib/prisma');

const sanitize = value => {
  if (!value) return value;
  const clone = JSON.parse(JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item));
  ['password', 'token', 'jwt', 'authorization'].forEach(key => { if (clone[key]) clone[key] = '[REDACTED]'; });
  return clone;
};

const record = (req, data) => prisma.auditLog.create({ data: {
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
}});

const list = filters => {
  const where = {};
  if (filters.actorId) where.actorId = Number(filters.actorId);
  if (filters.employeeId) where.employeeId = Number(filters.employeeId);
  if (filters.action) where.action = filters.action;
  if (filters.entity) where.entity = filters.entity;
  if (filters.from || filters.to) where.createdAt = {
    ...(filters.from && { gte: new Date(filters.from) }),
    ...(filters.to && { lte: new Date(`${filters.to}T23:59:59.999Z`) }),
  };
  return prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, take: 500 });
};

module.exports = { record, list, sanitize };
