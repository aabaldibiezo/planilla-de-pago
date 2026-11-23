const prisma = require('../lib/prisma');
const { scope } = require('../lib/tenant');
const { rateForMonth, currentRate } = require('../lib/contract-rates');
const { pendingCollections: calcularPendientes } = require('../lib/collections');
const { contratosPorVencer } = require('../lib/contract-expiry');
const { boliviaToday } = require('../lib/business-rules');

/**
 * Clientes de la empresa de limpieza, sus contratos y el historial de montos.
 *
 * ⚠️ Todos los montos de este servicio están en BOLIVIANOS, como los sueldos.
 * La suscripción a la plataforma (`platform.service`) está en dólares y las
 * dos monedas no se convierten entre sí.
 *
 * Como en el resto de los servicios, `companyId` viaja como primer argumento
 * y las búsquedas por id usan `findFirst` con ámbito: `findUnique` no admite
 * filtros de relación, y sin el filtro bastaría con adivinar un id ajeno.
 */

const CONTRACT_RATE_FIELDS = {
  id: true,
  amount: true,
  validFrom: true,
  notes: true,
  createdAt: true,
};

/** Convierte los Decimal de Prisma a número para que el JSON sea usable. */
const conMonto = (rate) =>
  rate ? { ...rate, amount: Number(rate.amount) } : null;

/**
 * Añade a un contrato su monto vigente y el del mes consultado.
 * El historial completo viaja aparte, por `rateHistory`.
 */
const conVigente = (contract, month, year) => {
  const rates = contract.rates || [];

  return {
    ...contract,
    rates: undefined,
    currentRate: conMonto(currentRate(rates)),
    rateForPeriod:
      month && year ? conMonto(rateForMonth(rates, month, year)) : undefined,
    rateCount: rates.length,
  };
};

// --------------- Clientes ---------------

const list = async (companyId, { includeInactive = false, month, year } = {}) => {
  const clients = await prisma.client.findMany({
    where: {
      ...scope('client', companyId),
      ...(includeInactive ? {} : { isActive: true }),
    },
    include: {
      contracts: {
        where: includeInactive ? {} : { isActive: true },
        include: {
          rates: { select: CONTRACT_RATE_FIELDS, orderBy: { validFrom: 'desc' } },
          worksites: { select: { id: true, name: true, address: true, isActive: true } },
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  return clients.map((client) => ({
    ...client,
    contracts: client.contracts.map((contract) => conVigente(contract, month, year)),
  }));
};

const getById = async (companyId, id) => {
  const client = await prisma.client.findFirst({
    where: { id: Number(id), ...scope('client', companyId) },
    include: {
      contracts: {
        include: {
          rates: { select: CONTRACT_RATE_FIELDS, orderBy: { validFrom: 'desc' } },
          worksites: { select: { id: true, name: true, address: true, isActive: true } },
        },
        orderBy: { name: 'asc' },
      },
    },
  });
  if (!client) throw new Error('Cliente no encontrado');

  return {
    ...client,
    contracts: client.contracts.map((contract) => conVigente(contract)),
  };
};

const create = (companyId, data, actorId) =>
  prisma.client.create({
    data: {
      companyId,
      name: data.name,
      taxId: data.taxId || null,
      contactName: data.contactName || null,
      contactPhone: data.contactPhone || null,
      contactEmail: data.contactEmail || null,
      notes: data.notes || null,
      createdBy: actorId,
      updatedBy: actorId,
    },
  });

const update = async (companyId, id, data, actorId) => {
  const existente = await prisma.client.findFirst({
    where: { id: Number(id), ...scope('client', companyId) },
  });
  if (!existente) throw new Error('Cliente no encontrado');

  return prisma.client.update({
    where: { id: existente.id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.taxId !== undefined && { taxId: data.taxId || null }),
      ...(data.contactName !== undefined && { contactName: data.contactName || null }),
      ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone || null }),
      ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail || null }),
      ...(data.notes !== undefined && { notes: data.notes || null }),
      ...(data.isActive !== undefined && { isActive: Boolean(data.isActive) }),
      updatedBy: actorId,
    },
  });
};

/**
 * Baja lógica. Nunca se borra: los contratos y sus montos son el respaldo de
 * lo que se facturó, y las sedes vinculadas siguen teniendo asistencia.
 */
const remove = async (companyId, id, actorId) => {
  const existente = await prisma.client.findFirst({
    where: { id: Number(id), ...scope('client', companyId) },
  });
  if (!existente) throw new Error('Cliente no encontrado');

  return prisma.$transaction(async (tx) => {
    // Un cliente inactivo con contratos activos colgando sería incoherente:
    // el listado los escondería pero seguirían contando como vigentes.
    await tx.contract.updateMany({
      where: { clientId: existente.id },
      data: { isActive: false, updatedBy: actorId },
    });

    return tx.client.update({
      where: { id: existente.id },
      data: { isActive: false, updatedBy: actorId },
    });
  });
};

// --------------- Contratos ---------------

/** Verifica que el contrato exista y pertenezca a la empresa. */
const contratoDeLaEmpresa = async (companyId, contractId, tx = prisma) => {
  const contract = await tx.contract.findFirst({
    where: { id: Number(contractId), ...scope('contract', companyId) },
  });
  if (!contract) throw new Error('Contrato no encontrado');
  return contract;
};

const createContract = async (companyId, clientId, data, actorId) => {
  const client = await prisma.client.findFirst({
    where: { id: Number(clientId), ...scope('client', companyId) },
  });
  if (!client) throw new Error('Cliente no encontrado');
  if (!client.isActive) throw new Error('No se puede agregar un contrato a un cliente dado de baja');

  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        clientId: client.id,
        name: data.name,
        reference: data.reference || null,
        paymentTerms: data.paymentTerms,
        startDate: data.startDate ? new Date(`${String(data.startDate).slice(0, 10)}T00:00:00.000Z`) : null,
        endDate: data.endDate ? new Date(`${String(data.endDate).slice(0, 10)}T00:00:00.000Z`) : null,
        billingDay: data.billingDay != null ? Number(data.billingDay) : 5,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    // El monto inicial es opcional: se puede cargar el contrato y ponerle
    // precio después, cuando esté cerrado.
    if (data.amount != null) {
      await tx.contractRate.create({
        data: {
          contractId: contract.id,
          amount: Number(data.amount),
          validFrom: data.validFrom
            ? new Date(`${String(data.validFrom).slice(0, 10)}T00:00:00.000Z`)
            : contract.startDate || new Date(new Date().toISOString().slice(0, 10)),
          notes: 'Monto inicial del contrato',
          createdBy: actorId,
        },
      });
    }

    if (data.worksiteId != null) {
      await vincularSede(tx, companyId, contract.id, Number(data.worksiteId), actorId);
    }

    return tx.contract.findUnique({
      where: { id: contract.id },
      include: {
        rates: { select: CONTRACT_RATE_FIELDS, orderBy: { validFrom: 'desc' } },
        worksites: { select: { id: true, name: true, address: true, isActive: true } },
      },
    });
  });
};

const updateContract = async (companyId, id, data, actorId) => {
  const contract = await contratoDeLaEmpresa(companyId, id);

  return prisma.$transaction(async (tx) => {
    await tx.contract.update({
      where: { id: contract.id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.reference !== undefined && { reference: data.reference || null }),
        ...(data.paymentTerms !== undefined && { paymentTerms: data.paymentTerms }),
        ...(data.startDate !== undefined && {
          startDate: data.startDate
            ? new Date(`${String(data.startDate).slice(0, 10)}T00:00:00.000Z`)
            : null,
        }),
        ...(data.endDate !== undefined && {
          endDate: data.endDate
            ? new Date(`${String(data.endDate).slice(0, 10)}T00:00:00.000Z`)
            : null,
        }),
        ...(data.billingDay !== undefined && { billingDay: Number(data.billingDay) }),
        ...(data.isActive !== undefined && { isActive: Boolean(data.isActive) }),
        updatedBy: actorId,
      },
    });

    if (data.worksiteId !== undefined) {
      await vincularSede(
        tx,
        companyId,
        contract.id,
        data.worksiteId == null ? null : Number(data.worksiteId),
        actorId
      );
    }

    return tx.contract.findUnique({
      where: { id: contract.id },
      include: {
        rates: { select: CONTRACT_RATE_FIELDS, orderBy: { validFrom: 'desc' } },
        worksites: { select: { id: true, name: true, address: true, isActive: true } },
      },
    });
  });
};

/**
 * Vincula una sede al contrato, o la desvincula si `worksiteId` es null.
 *
 * La sede se busca acotada por empresa: sin eso se podría enganchar la sede de
 * otra empresa a un contrato propio y verle el nombre y la dirección.
 */
const vincularSede = async (tx, companyId, contractId, worksiteId, actorId) => {
  if (worksiteId == null) {
    await tx.worksite.updateMany({
      where: { contractId, ...scope('worksite', companyId) },
      data: { contractId: null, updatedBy: actorId },
    });
    return;
  }

  const sede = await tx.worksite.findFirst({
    where: { id: worksiteId, ...scope('worksite', companyId) },
  });
  if (!sede) throw new Error('Sede no encontrada');
  if (sede.contractId && sede.contractId !== contractId) {
    throw new Error('Esa sede ya está vinculada a otro contrato');
  }

  await tx.worksite.update({
    where: { id: sede.id },
    data: { contractId, updatedBy: actorId },
  });
};

// --------------- Montos ---------------

const rateHistory = async (companyId, contractId) => {
  const contract = await contratoDeLaEmpresa(companyId, contractId);

  const rates = await prisma.contractRate.findMany({
    where: { contractId: contract.id },
    select: CONTRACT_RATE_FIELDS,
    orderBy: { validFrom: 'desc' },
  });

  const vigente = currentRate(rates);

  return {
    contract: { id: contract.id, name: contract.name },
    // `isCurrent` se resuelve acá y no en la vista: la regla de cuál rige es
    // de negocio, y dos clientes distintos no deben reimplementarla.
    rates: rates.map((rate) => ({
      ...conMonto(rate),
      isCurrent: vigente ? rate.id === vigente.id : false,
    })),
  };
};

/**
 * Agrega un monto nuevo. Nunca modifica ni borra los anteriores: esa es toda
 * la razón de que el historial exista.
 */
const addRate = async (companyId, contractId, data, actorId) => {
  const contract = await contratoDeLaEmpresa(companyId, contractId);

  const validFrom = new Date(`${String(data.validFrom).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(validFrom.getTime())) throw new Error('La fecha de vigencia no es válida');

  const duplicado = await prisma.contractRate.findFirst({
    where: { contractId: contract.id, validFrom },
  });
  if (duplicado) {
    throw new Error(
      'Ya existe un monto con esa fecha de vigencia. Elija otra fecha o edite el existente.'
    );
  }

  const rate = await prisma.contractRate.create({
    data: {
      contractId: contract.id,
      amount: Number(data.amount),
      validFrom,
      notes: data.notes || null,
      createdBy: actorId,
    },
    select: CONTRACT_RATE_FIELDS,
  });

  return conMonto(rate);
};

/** Monto que rige para un contrato en un mes dado. Lo usa la facturación. */
const rateForPeriod = async (companyId, contractId, month, year) => {
  const contract = await contratoDeLaEmpresa(companyId, contractId);

  const rates = await prisma.contractRate.findMany({
    where: { contractId: contract.id },
    select: CONTRACT_RATE_FIELDS,
    orderBy: { validFrom: 'desc' },
  });

  return conMonto(rateForMonth(rates, month, year));
};

// --------------- Cobros a clientes ---------------

/**
 * Cobros que ya corresponde recordar: vencidos o por vencer en pocos días,
 * todavía sin registrar. Se calculan al pedirlos (lib/collections), así un
 * cambio de tarifa o de día de cobro se refleja solo.
 */
const pendingCollections = async (companyId) => {
  const contratos = await prisma.contract.findMany({
    where: { ...scope('contract', companyId), isActive: true },
    include: {
      client: { select: { id: true, name: true, isActive: true } },
      rates: { select: CONTRACT_RATE_FIELDS },
      collections: { select: { month: true, year: true } },
    },
  });

  const porId = new Map(contratos.map((c) => [c.id, c]));
  return calcularPendientes(contratos, boliviaToday()).map((p) => {
    const contrato = porId.get(p.contractId);
    return {
      ...p,
      contractName: contrato.name,
      paymentTerms: contrato.paymentTerms,
      clientId: contrato.client.id,
      clientName: contrato.client.name,
    };
  });
};

/**
 * Contratos por vencer (próximas 2 semanas) o vencidos hace poco y sin
 * renovar, para avisar y renovarlos a tiempo. Ver lib/contract-expiry.
 */
const expiringContracts = async (companyId) => {
  const contratos = await prisma.contract.findMany({
    where: { ...scope('contract', companyId), isActive: true, endDate: { not: null } },
    include: {
      client: { select: { id: true, name: true, isActive: true } },
      rates: { select: CONTRACT_RATE_FIELDS },
    },
  });
  const activos = contratos.filter((c) => c.client.isActive !== false);
  const porId = new Map(activos.map((c) => [c.id, c]));

  return contratosPorVencer(activos, boliviaToday()).map((v) => {
    const contrato = porId.get(v.contractId);
    const montoVigente = [...contrato.rates]
      .sort((a, b) => new Date(b.validFrom) - new Date(a.validFrom))
      .find((r) => new Date(r.validFrom) <= new Date());
    return {
      ...v,
      contractName: contrato.name,
      reference: contrato.reference,
      clientId: contrato.client.id,
      clientName: contrato.client.name,
      monthlyAmount: montoVigente ? Number(montoVigente.amount) : null,
    };
  });
};

/** Registra que se cobró un mes de un contrato, con el monto que rigió ese mes. */
const collect = async (companyId, contractId, { month, year, notes }, actorId) => {
  const contrato = await contratoDeLaEmpresa(companyId, contractId);
  const rates = await prisma.contractRate.findMany({
    where: { contractId: contrato.id },
    select: CONTRACT_RATE_FIELDS,
  });
  const monto = rateForMonth(rates, Number(month), Number(year));
  if (!monto) throw new Error('El contrato no tiene monto cargado para ese mes');

  const repetido = await prisma.contractCollection.findFirst({
    where: { contractId: contrato.id, month: Number(month), year: Number(year) },
  });
  if (repetido) throw new Error('Ese mes ya está registrado como cobrado');

  return prisma.contractCollection.create({
    data: {
      contractId: contrato.id,
      month: Number(month),
      year: Number(year),
      amount: monto.amount,
      collectedOn: boliviaToday(),
      notes: notes || null,
      createdBy: actorId,
    },
  });
};

/** Deshace un cobro registrado por error. */
const undoCollection = async (companyId, contractId, month, year) => {
  const cobro = await prisma.contractCollection.findFirst({
    where: {
      ...scope('contractCollection', companyId),
      contractId: Number(contractId),
      month: Number(month),
      year: Number(year),
    },
  });
  if (!cobro) throw new Error('Cobro no encontrado');
  await prisma.contractCollection.delete({ where: { id: cobro.id } });
  return cobro;
};

module.exports = {
  pendingCollections,
  expiringContracts,
  collect,
  undoCollection,
  list,
  getById,
  create,
  update,
  remove,
  createContract,
  updateContract,
  rateHistory,
  addRate,
  rateForPeriod,
};
