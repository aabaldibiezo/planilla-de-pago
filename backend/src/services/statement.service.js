const prisma = require('../lib/prisma');
const { scope } = require('../lib/tenant');
const { rateForMonth } = require('../lib/contract-rates');
const { payrollClosure } = require('../lib/payroll-closure');
const { buildStatement } = require('../lib/statement-builder');
const { buildEconomicDetail } = require('../lib/economic-detail');
const { dueDateFor } = require('../lib/collections');
const { boliviaToday } = require('../lib/business-rules');

/**
 * Estado de resultados mensual de la empresa cliente.
 *
 * ⚠️ Todos los montos están en BOLIVIANOS, como la nómina y los contratos.
 *
 * El estado NO se guarda: se calcula al pedirlo. Guardar una foto del mes
 * quedaría vieja apenas se confirmara un pago de nómina o se cargara un gasto,
 * y el requisito es que se recalcule ante cualquier cambio, sin importar el
 * orden en que se carguen las cosas. Solo se persiste lo que se carga a mano.
 */

const CATEGORY_FIELDS = {
  id: true,
  name: true,
  kind: true,
  isSystem: true,
  isActive: true,
  sortOrder: true,
};

// --------------- Piezas del cálculo ---------------

/**
 * Ingreso por servicios: el monto vigente de cada contrato activo ese mes.
 *
 * Se usa `rateForMonth`, que respeta la fecha de vigencia, así que un aumento
 * de precio de hoy no reescribe lo que se facturó en marzo.
 *
 * Un contrato sin monto cargado se informa igual con `amount: 0` y la marca
 * `missingRate`: esconderlo haría que el total pareciera completo cuando no lo
 * está.
 */
const serviceIncomeFor = async (companyId, month, year) => {
  const contratos = await prisma.contract.findMany({
    where: { ...scope('contract', companyId), isActive: true },
    include: {
      client: { select: { id: true, name: true, isActive: true } },
      rates: {
        select: { id: true, amount: true, validFrom: true },
        orderBy: { validFrom: 'desc' },
      },
    },
  });

  return contratos
    .filter((contrato) => contrato.client.isActive)
    .map((contrato) => {
      const vigente = rateForMonth(contrato.rates, month, year);
      return {
        contractId: contrato.id,
        contractName: contrato.name,
        clientId: contrato.client.id,
        clientName: contrato.client.name,
        paymentTerms: contrato.paymentTerms,
        billingDay: contrato.billingDay,
        amount: vigente ? Number(vigente.amount) : 0,
        missingRate: !vigente,
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName, 'es'));
};

/**
 * Salarios del mes, separados por clasificación contable.
 *
 * Sale de `Payment.netPay`, o sea lo efectivamente liquidado, no el salario
 * nominal: es lo que realmente costó el mes.
 */
const salariesFor = async (companyId, month, year) => {
  const pagos = await prisma.payment.findMany({
    where: { ...scope('payment', companyId), month: Number(month), year: Number(year) },
    include: { user: { select: { id: true, staffCategory: true } } },
  });

  const totales = { OPERATIVO: 0, ADMINISTRATIVO: 0 };
  pagos.forEach((pago) => {
    const categoria = pago.user.staffCategory || 'OPERATIVO';
    totales[categoria] += Number(pago.netPay);
  });

  return { totales, pagos };
};

/** Estado de la nómina del mes, derivado de los pagos y la plantilla. */
const payrollStatusFor = async (companyId, month, year, pagos) => {
  const empleados = await prisma.user.findMany({
    where: { ...scope('user', companyId), role: 'EMPLOYEE' },
    select: { id: true, isActive: true, createdAt: true },
  });

  return payrollClosure(empleados, pagos, Number(month), Number(year));
};

// --------------- Estado del mes ---------------

/**
 * Detalle económico del mes: cobros por contrato, sueldos por persona,
 * descuentos a empleados y los dos saldos (caja hoy y esperado al cierre).
 * Se pide solo al ver un mes: para comparar meses alcanza con los totales.
 */
const economicDetailFor = async (companyId, m, y, estado) => {
  // Se carga acá para no crear una dependencia circular al iniciar.
  const paymentService = require('./payment.service');

  const [cobros, pagos, borradores] = await Promise.all([
    prisma.contractCollection.findMany({
      where: { ...scope('contractCollection', companyId), month: m, year: y },
      select: { contractId: true, amount: true, collectedOn: true },
    }),
    prisma.payment.findMany({
      where: { ...scope('payment', companyId), month: m, year: y },
      include: {
        details: true,
        user: {
          select: { firstName: true, lastName: true, staffCategory: true, employeeType: true },
        },
      },
    }),
    paymentService.calculateAll(companyId, m, y),
  ]);

  const cobroPorContrato = new Map(cobros.map((c) => [c.contractId, c]));
  const contratos = estado.income.contracts.map((c) => ({
    ...c,
    dueDate: dueDateFor(c, m, y).toISOString().slice(0, 10),
    collection: cobroPorContrato.get(c.contractId)
      ? {
          amount: Number(cobroPorContrato.get(c.contractId).amount),
          collectedOn: cobroPorContrato.get(c.contractId).collectedOn,
        }
      : null,
  }));

  return buildEconomicDetail({
    contracts: contratos,
    otherIncome: estado.income.other,
    payments: pagos,
    drafts: borradores.filter((b) => !b.isPaid),
    expenses: estado.operating.expenses + estado.financial.total,
    today: boliviaToday().toISOString().slice(0, 10),
  });
};

const forMonth = async (companyId, month, year, { detalle = false } = {}) => {
  const m = Number(month);
  const y = Number(year);

  const [contractIncomes, { totales, pagos }, lineas] = await Promise.all([
    serviceIncomeFor(companyId, m, y),
    salariesFor(companyId, m, y),
    prisma.statementEntry.findMany({
      where: { ...scope('statementEntry', companyId), month: m, year: y },
      include: { category: { select: CATEGORY_FIELDS } },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const payroll = await payrollStatusFor(companyId, m, y, pagos);

  const estado = buildStatement({
    month: m,
    year: y,
    contractIncomes,
    otherIncomes: lineas.filter((linea) => linea.type === 'OTHER_INCOME'),
    salaries: totales,
    expenses: lineas.filter((linea) => linea.type === 'EXPENSE'),
    payroll,
  });

  if (detalle) estado.detail = await economicDetailFor(companyId, m, y, estado);
  return estado;
};

/**
 * Varios meses para comparar, del más viejo al más nuevo.
 *
 * Se calculan uno por uno en vez de con una consulta agregada: el cálculo de
 * un mes ya combina cuatro fuentes con reglas propias (vigencia de tarifas,
 * cierre de nómina), y duplicarlas en SQL sería tener dos verdades.
 */
const history = async (companyId, desde, hasta) => {
  const meses = [];
  let { month, year } = desde;

  // Tope de 24 meses: dos años es lo más que alguien compara de un vistazo, y
  // evita que un rango mal escrito dispare cientos de cálculos.
  for (let i = 0; i < 24; i += 1) {
    meses.push({ month, year });
    if (month === hasta.month && year === hasta.year) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    if (year > hasta.year || (year === hasta.year && month > hasta.month)) break;
  }

  const estados = [];
  for (const periodo of meses) {
    estados.push(await forMonth(companyId, periodo.month, periodo.year));
  }

  return estados;
};

// --------------- Categorías ---------------

const listCategories = (companyId, { includeInactive = false } = {}) =>
  prisma.expenseCategory.findMany({
    where: {
      ...scope('expenseCategory', companyId),
      ...(includeInactive ? {} : { isActive: true }),
    },
    select: { ...CATEGORY_FIELDS, _count: { select: { entries: true } } },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
  });

const createCategory = async (companyId, data, actorId) => {
  const duplicada = await prisma.expenseCategory.findFirst({
    where: { ...scope('expenseCategory', companyId), name: data.name.trim() },
  });
  if (duplicada) throw new Error('Ya existe una categoría con ese nombre');

  return prisma.expenseCategory.create({
    data: {
      companyId,
      name: data.name.trim(),
      kind: data.kind || 'OPERATING',
      isSystem: false,
      // Las propias van después de las predefinidas, salvo que se indique otro.
      sortOrder: data.sortOrder ?? 500,
      createdBy: actorId,
      updatedBy: actorId,
    },
  });
};

const updateCategory = async (companyId, id, data, actorId) => {
  const existente = await prisma.expenseCategory.findFirst({
    where: { id: Number(id), ...scope('expenseCategory', companyId) },
  });
  if (!existente) throw new Error('Categoría no encontrada');

  if (data.name && data.name.trim() !== existente.name) {
    const duplicada = await prisma.expenseCategory.findFirst({
      where: { ...scope('expenseCategory', companyId), name: data.name.trim() },
    });
    if (duplicada) throw new Error('Ya existe una categoría con ese nombre');
  }

  return prisma.expenseCategory.update({
    where: { id: existente.id },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.kind !== undefined && { kind: data.kind }),
      ...(data.sortOrder !== undefined && { sortOrder: Number(data.sortOrder) }),
      ...(data.isActive !== undefined && { isActive: Boolean(data.isActive) }),
      updatedBy: actorId,
    },
  });
};

/**
 * Baja de una categoría.
 *
 * Si nunca se usó se borra de verdad; si tiene gastos imputados se desactiva.
 * Borrarla en ese caso rompería meses ya cerrados, y dejar basura desactivada
 * cuando no hace falta ensucia el listado.
 */
const removeCategory = async (companyId, id, actorId) => {
  const existente = await prisma.expenseCategory.findFirst({
    where: { id: Number(id), ...scope('expenseCategory', companyId) },
    include: { _count: { select: { entries: true } } },
  });
  if (!existente) throw new Error('Categoría no encontrada');

  if (existente._count.entries === 0) {
    await prisma.expenseCategory.delete({ where: { id: existente.id } });
    return { deleted: true, name: existente.name };
  }

  await prisma.expenseCategory.update({
    where: { id: existente.id },
    data: { isActive: false, updatedBy: actorId },
  });
  return { deleted: false, name: existente.name, usedIn: existente._count.entries };
};

/** Catálogo inicial. Debe coincidir con el de la migración. */
const CATEGORIAS_PREDEFINIDAS = [
  { name: 'Luz', kind: 'OPERATING', sortOrder: 10 },
  { name: 'Agua', kind: 'OPERATING', sortOrder: 20 },
  { name: 'Alquiler', kind: 'OPERATING', sortOrder: 30 },
  { name: 'Internet', kind: 'OPERATING', sortOrder: 40 },
  { name: 'Teléfono', kind: 'OPERATING', sortOrder: 50 },
  { name: 'Contador', kind: 'OPERATING', sortOrder: 60 },
  { name: 'Impuestos', kind: 'OPERATING', sortOrder: 70 },
  { name: 'Insumos de limpieza', kind: 'OPERATING', sortOrder: 80 },
  { name: 'Combustible', kind: 'OPERATING', sortOrder: 90 },
  { name: 'Pasajes y transporte', kind: 'OPERATING', sortOrder: 100 },
  { name: 'Mantenimiento y reparaciones', kind: 'OPERATING', sortOrder: 110 },
  { name: 'Seguros', kind: 'OPERATING', sortOrder: 120 },
  { name: 'Imprevistos', kind: 'OPERATING', sortOrder: 130 },
  { name: 'Intereses de préstamo', kind: 'FINANCIAL', sortOrder: 200 },
  { name: 'Comisiones bancarias', kind: 'FINANCIAL', sortOrder: 210 },
];

/**
 * Siembra las categorías predefinidas. Idempotente: se puede llamar de nuevo
 * para reponer las que alguien borró, sin duplicar las que siguen.
 *
 * Recibe `tx` para poder correr dentro de la transacción del alta de empresa.
 */
const seedDefaultCategories = async (companyId, tx = prisma) => {
  const existentes = new Set(
    (await tx.expenseCategory.findMany({ where: { companyId }, select: { name: true } })).map(
      (categoria) => categoria.name
    )
  );

  const faltantes = CATEGORIAS_PREDEFINIDAS.filter((categoria) => !existentes.has(categoria.name));
  if (faltantes.length === 0) return { created: 0 };

  await tx.expenseCategory.createMany({
    data: faltantes.map((categoria) => ({ ...categoria, companyId, isSystem: true })),
  });

  return { created: faltantes.length };
};

// --------------- Líneas del mes ---------------

const createEntry = async (companyId, data, actorId) => {
  if (data.type === 'EXPENSE') {
    if (!data.categoryId) throw new Error('Elija una categoría para el gasto');

    const categoria = await prisma.expenseCategory.findFirst({
      where: { id: Number(data.categoryId), ...scope('expenseCategory', companyId) },
    });
    if (!categoria) throw new Error('Categoría no encontrada');
  }

  return prisma.statementEntry.create({
    data: {
      companyId,
      month: Number(data.month),
      year: Number(data.year),
      type: data.type,
      categoryId: data.type === 'EXPENSE' ? Number(data.categoryId) : null,
      description: data.description.trim(),
      amount: Number(data.amount),
      occurredOn: data.occurredOn
        ? new Date(`${String(data.occurredOn).slice(0, 10)}T00:00:00.000Z`)
        : null,
      createdBy: actorId,
    },
    include: { category: { select: CATEGORY_FIELDS } },
  });
};

const updateEntry = async (companyId, id, data) => {
  const existente = await prisma.statementEntry.findFirst({
    where: { id: Number(id), ...scope('statementEntry', companyId) },
  });
  if (!existente) throw new Error('Movimiento no encontrado');

  return prisma.statementEntry.update({
    where: { id: existente.id },
    data: {
      ...(data.description !== undefined && { description: data.description.trim() }),
      ...(data.amount !== undefined && { amount: Number(data.amount) }),
      ...(data.categoryId !== undefined && { categoryId: Number(data.categoryId) }),
      ...(data.occurredOn !== undefined && {
        occurredOn: data.occurredOn
          ? new Date(`${String(data.occurredOn).slice(0, 10)}T00:00:00.000Z`)
          : null,
      }),
    },
    include: { category: { select: CATEGORY_FIELDS } },
  });
};

/**
 * Borra una línea. Como las líneas son por mes, esto nunca puede afectar a
 * otro mes: es lo que permite quitar de un clic una categoría que este mes no
 * aplica sin tocar los meses donde sí se usó.
 */
const removeEntry = async (companyId, id) => {
  const existente = await prisma.statementEntry.findFirst({
    where: { id: Number(id), ...scope('statementEntry', companyId) },
  });
  if (!existente) throw new Error('Movimiento no encontrado');

  await prisma.statementEntry.delete({ where: { id: existente.id } });
  return existente;
};

module.exports = {
  forMonth,
  history,
  listCategories,
  createCategory,
  updateCategory,
  removeCategory,
  seedDefaultCategories,
  createEntry,
  updateEntry,
  removeEntry,
  CATEGORIAS_PREDEFINIDAS,
};
