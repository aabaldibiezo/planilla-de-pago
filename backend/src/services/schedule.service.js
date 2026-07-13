const prisma = require('../lib/prisma');
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const minutes = value => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const validateBlocks = blocks => {
  if (!Array.isArray(blocks) || !blocks.length) throw new Error('Debe registrar al menos un bloque de horario');
  const normalized = blocks.map((b, index) => {
    if (!Number.isInteger(Number(b.dayOfWeek)) || b.dayOfWeek < 0 || b.dayOfWeek > 6) throw new Error('El día del horario no es válido');
    if (!TIME.test(b.startTime) || !TIME.test(b.endTime)) throw new Error('Las horas deben usar el formato HH:MM');
    if (b.startTime === b.endTime) throw new Error('La entrada y salida no pueden ser iguales');
    return { dayOfWeek: Number(b.dayOfWeek), startTime: b.startTime, endTime: b.endTime, blockOrder: index + 1, crossesMidnight: minutes(b.endTime) < minutes(b.startTime), isActive: b.isActive !== false };
  });
  for (const day of [...new Set(normalized.map(b => b.dayOfWeek))]) {
    const ranges = normalized.filter(b => b.dayOfWeek === day).map(b => ({ ...b, start: minutes(b.startTime), end: minutes(b.endTime) + (b.crossesMidnight ? 1440 : 0) })).sort((a,b) => a.start-b.start);
    for (let i=1;i<ranges.length;i++) if (ranges[i].start < ranges[i-1].end) throw new Error('Existen bloques de horario solapados en el mismo día');
  }
  return normalized;
};

const replaceForUser = async (tx, userId, scheduleType, blocks, actorId) => {
  const valid = validateBlocks(blocks);
  await tx.scheduleBlock.deleteMany({ where: { userId } });
  await tx.user.update({ where: { id: userId }, data: { scheduleType } });
  await tx.scheduleBlock.createMany({ data: valid.map(b => ({ ...b, userId, createdBy: actorId, updatedBy: actorId })) });
};

module.exports = { validateBlocks, replaceForUser, minutes };
