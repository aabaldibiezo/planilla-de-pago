/**
 * Detalle económico del mes: de dónde entra la plata, a dónde sale y qué
 * falta todavía.
 *
 * El estado de resultados (statement-builder) da los totales contables. Esto
 * agrega lo que la dueña pregunta en la práctica:
 *   - cada contrato, ¿ya pagó o falta cobrarle?
 *   - cada empleado, ¿ya cobró o falta pagarle, y cuánto?
 *   - ¿cuánto se les descontó y por qué (retrasos, daños, adelantos…)?
 *   - ¿cuánta plata hay hoy, y cuánta debería quedar al cerrar el mes?
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 * Montos en BOLIVIANOS.
 */

const { redondear, sumar } = require('./statement-builder');

const TIPOS_DESCUENTO = [
  'UNJUSTIFIED_DELAY',
  'UNJUSTIFIED_ABSENCE',
  'COMPANY_DAMAGE',
  'SALARY_ADVANCE',
  'LOAN',
  'OTHER',
];

const vacio = () => Object.fromEntries(TIPOS_DESCUENTO.map((t) => [t, 0]));

/** Descuentos de un pago ya hecho, por tipo. Los pagos viejos solo tenían retraso. */
const descuentosDePago = (pago) => {
  const porTipo = vacio();
  const detalles = (pago.details || []).filter((d) => d.type === 'DISCOUNT');
  if (detalles.length) {
    detalles.forEach((d) => {
      const tipo = TIPOS_DESCUENTO.includes(d.code) ? d.code : 'OTHER';
      porTipo[tipo] = redondear(porTipo[tipo] + Number(d.amount));
    });
  } else {
    porTipo.UNJUSTIFIED_DELAY = redondear(pago.discountAmount || 0);
  }
  return porTipo;
};

/** Descuentos que se van a aplicar en un pago todavía no hecho. */
const descuentosDeBorrador = (borrador) => {
  const porTipo = vacio();
  porTipo.UNJUSTIFIED_DELAY = redondear(borrador.discountAmount || 0);
  (borrador.discounts || []).forEach((d) => {
    const tipo = TIPOS_DESCUENTO.includes(d.type) ? d.type : 'OTHER';
    porTipo[tipo] = redondear(porTipo[tipo] + Number(d.amount));
  });
  return porTipo;
};

/**
 * @param {object} datos
 * @param {Array} datos.contracts    ingresos por contrato del estado, con
 *                                    `collection` ({amount, collectedOn}) si se
 *                                    cobró y `dueDate` del cobro
 * @param {number} datos.otherIncome  otros ingresos cargados a mano
 * @param {Array} datos.payments      pagos de nómina hechos ese mes, con `user`
 * @param {Array} datos.drafts        borradores de nómina (calculatePayment) de
 *                                    quienes todavía no cobraron
 * @param {number} datos.expenses     gastos operativos + financieros cargados
 * @param {string} datos.today        hoy, YYYY-MM-DD, para marcar vencidos
 */
const buildEconomicDetail = ({
  contracts = [],
  otherIncome = 0,
  payments = [],
  drafts = [],
  expenses = 0,
  today,
}) => {
  // --------------- Cobros a clientes ---------------

  const cobros = contracts.map((c) => {
    const cobrado = Boolean(c.collection);
    return {
      contractId: c.contractId,
      clientName: c.clientName,
      contractName: c.contractName,
      amount: redondear(cobrado ? c.collection.amount : c.amount),
      status: cobrado ? 'COBRADO' : 'POR_COBRAR',
      collectedOn: cobrado ? c.collection.collectedOn : null,
      dueDate: c.dueDate || null,
      overdue: !cobrado && Boolean(c.dueDate) && c.dueDate < today,
      missingRate: Boolean(c.missingRate),
    };
  });
  const cobrado = sumar(cobros.filter((c) => c.status === 'COBRADO').map((c) => c.amount));
  const porCobrar = sumar(cobros.filter((c) => c.status === 'POR_COBRAR').map((c) => c.amount));

  // --------------- Sueldos ---------------

  const pagados = payments.map((p) => ({
    userId: p.userId,
    name: `${p.user.firstName} ${p.user.lastName}`,
    category: p.user.staffCategory || 'OPERATIVO',
    employeeType: p.user.employeeType,
    status: 'PAGADO',
    gross: redondear(p.totalIncome || p.grossPay || 0),
    net: redondear(p.netPay),
    paidAt: p.paidAt,
    discounts: descuentosDePago(p),
  }));

  const pendientes = drafts
    // Un temporal que no trabajó ningún día no tiene nada que cobrar.
    .filter((d) => !(d.payScheme === 'DAILY' && !d.daysWorked))
    .map((d) => ({
      userId: d.user.id,
      name: `${d.user.firstName} ${d.user.lastName}`,
      category: d.user.staffCategory || 'OPERATIVO',
      employeeType: d.user.employeeType,
      status: 'POR_PAGAR',
      gross: redondear(d.totalIncome || 0),
      net: redondear(d.netPay || 0),
      paidAt: null,
      discounts: descuentosDeBorrador(d),
    }));

  const sueldos = [...pagados, ...pendientes].sort(
    (a, b) => (a.status === b.status ? a.name.localeCompare(b.name, 'es') : a.status === 'POR_PAGAR' ? -1 : 1)
  );
  const pagado = sumar(pagados.map((s) => s.net));
  const porPagar = sumar(pendientes.map((s) => s.net));

  // --------------- Descuentos a empleados ---------------

  const descuentosPorTipo = vacio();
  sueldos.forEach((s) =>
    TIPOS_DESCUENTO.forEach((t) => {
      descuentosPorTipo[t] = redondear(descuentosPorTipo[t] + s.discounts[t]);
    })
  );
  const totalDescuentos = sumar(Object.values(descuentosPorTipo));

  // --------------- Saldos ---------------

  // Caja: lo que efectivamente entró y salió hasta hoy.
  const entro = redondear(cobrado + otherIncome);
  const salio = redondear(pagado + expenses);

  // Esperado: si se cobra todo lo que falta y se paga todo lo que falta.
  const ingresosEsperados = redondear(cobrado + porCobrar + otherIncome);
  const egresosEsperados = redondear(pagado + porPagar + expenses);

  return {
    collections: { lines: cobros, collected: cobrado, pending: porCobrar },
    salaries: { lines: sueldos, paid: pagado, pending: porPagar },
    employeeDiscounts: { byType: descuentosPorTipo, total: totalDescuentos },
    cash: { in: entro, out: salio, balance: redondear(entro - salio) },
    expected: {
      income: ingresosEsperados,
      outcome: egresosEsperados,
      balance: redondear(ingresosEsperados - egresosEsperados),
    },
  };
};

module.exports = { buildEconomicDetail, TIPOS_DESCUENTO };
