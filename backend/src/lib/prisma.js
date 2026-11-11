const { PrismaClient } = require('@prisma/client');

const prisma =
  global.__planillaPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') global.__planillaPrisma = prisma;

module.exports = prisma;
