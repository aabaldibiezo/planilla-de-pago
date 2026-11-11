const { minutes, validateBlocks } = require('../lib/business-rules');

/**
 * Reemplaza por completo los bloques de horario de un empleado dentro de una transacción.
 */
const replaceForUser = async (tx, userId, scheduleType, blocks, actorId) => {
  const valid = validateBlocks(blocks);

  await tx.scheduleBlock.deleteMany({ where: { userId } });
  await tx.user.update({ where: { id: userId }, data: { scheduleType } });
  await tx.scheduleBlock.createMany({
    data: valid.map((block) => ({ ...block, userId, createdBy: actorId, updatedBy: actorId })),
  });
};

module.exports = { validateBlocks, replaceForUser, minutes };
