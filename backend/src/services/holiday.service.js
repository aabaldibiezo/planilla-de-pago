const prisma = require('../lib/prisma');
const { scope } = require('../lib/tenant');
const { nationalHolidays } = require('../lib/holidays');

/**
 * Feriados de la empresa y cuánto se paga un día extra.
 *
 * Toda función recibe `companyId` primero: los feriados departamentales de
 * una empresa no deben aparecerle a otra.
 */

const soloFecha = (valor) => new Date(valor).toISOString().slice(0, 10);

/** Feriados de un año: los nacionales (calculados) y los propios (editables). */
const forYear = async (companyId, year) => {
  const anio = Number(year);
  const [propios, empresa] = await Promise.all([
    prisma.holiday.findMany({
      where: {
        ...scope('holiday', companyId),
        date: {
          gte: new Date(Date.UTC(anio, 0, 1)),
          lte: new Date(Date.UTC(anio, 11, 31)),
        },
      },
      orderBy: { date: 'asc' },
    }),
    prisma.company.findUnique({ where: { id: companyId }, select: { extraDayFactor: true } }),
  ]);

  return {
    year: anio,
    national: nationalHolidays(anio),
    company: propios.map((f) => ({ id: f.id, date: soloFecha(f.date), name: f.name })),
    extraDayFactor: Number(empresa?.extraDayFactor ?? 2),
  };
};

const create = async (companyId, { date, name }, actorId) => {
  const fecha = soloFecha(date);
  const anio = Number(fecha.slice(0, 4));

  if (nationalHolidays(anio).some((f) => f.date === fecha)) {
    throw new Error('Esa fecha ya es feriado nacional');
  }

  const repetido = await prisma.holiday.findFirst({
    where: { ...scope('holiday', companyId), date: new Date(`${fecha}T00:00:00.000Z`) },
  });
  if (repetido) throw new Error('Ya existe un feriado en esa fecha');

  return prisma.holiday.create({
    data: {
      companyId,
      date: new Date(`${fecha}T00:00:00.000Z`),
      name: String(name).trim(),
      createdBy: actorId,
    },
  });
};

const remove = async (companyId, id) => {
  const feriado = await prisma.holiday.findFirst({
    where: { id: Number(id), ...scope('holiday', companyId) },
  });
  if (!feriado) throw new Error('Feriado no encontrado');

  await prisma.holiday.delete({ where: { id: feriado.id } });
  return feriado;
};

const setExtraDayFactor = (companyId, factor, actorId) =>
  prisma.company.update({
    where: { id: companyId },
    data: { extraDayFactor: Number(factor), updatedBy: actorId },
    select: { extraDayFactor: true },
  });

module.exports = { forYear, create, remove, setExtraDayFactor };
