/**
 * Armado del estado de resultados a partir de sus partes.
 *
 * Módulo puro, sin Prisma: el servicio busca los datos y esto los ordena y
 * suma. Separarlo permite probar el cálculo —que es lo que puede estar mal—
 * sin levantar una base.
 *
 * ⚠️ Todos los montos están en BOLIVIANOS, como la nómina y los contratos.
 */

/** Redondeo a dos decimales, para que las sumas no arrastren coma flotante. */
const redondear = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

const sumar = (valores) => redondear(valores.reduce((total, v) => total + Number(v || 0), 0));

/**
 * Arma el estado de un mes.
 *
 * La incertidumbre de la nómina contamina hacia arriba: si el salario es
 * provisional, el total de costos y el saldo también lo son. Un saldo que
 * parece firme sin serlo es el error más caro de esta pantalla, así que
 * `isProvisional` sube hasta la última línea.
 *
 * @param {object} datos
 * @param {Array} datos.contractIncomes  [{contractId, clientName, contractName, amount}]
 * @param {Array} datos.otherIncomes     StatementEntry tipo OTHER_INCOME
 * @param {object} datos.salaries        {OPERATIVO, ADMINISTRATIVO}
 * @param {Array} datos.expenses         StatementEntry tipo EXPENSE, con su categoría
 * @param {object} datos.payroll         resultado de `payrollClosure`
 */
const buildStatement = ({
  month,
  year,
  contractIncomes = [],
  otherIncomes = [],
  salaries = {},
  expenses = [],
  payroll,
}) => {
  // --------------- Ingresos ---------------

  const serviceIncome = sumar(contractIncomes.map((linea) => linea.amount));
  const otherIncome = sumar(otherIncomes.map((linea) => linea.amount));
  const totalIncome = redondear(serviceIncome + otherIncome);

  // --------------- Salarios ---------------

  const operationalSalary = redondear(salaries.OPERATIVO || 0);
  const administrativeSalary = redondear(salaries.ADMINISTRATIVO || 0);
  const totalSalary = redondear(operationalSalary + administrativeSalary);

  const isProvisional = !payroll.closed;

  // --------------- Gastos ---------------

  // Se agrupan por categoría para que la pantalla muestre una línea por
  // concepto, con el detalle de los movimientos dentro.
  const porCategoria = new Map();

  expenses.forEach((gasto) => {
    const categoria = gasto.category;
    const clave = categoria?.id ?? 'sin-categoria';

    if (!porCategoria.has(clave)) {
      porCategoria.set(clave, {
        categoryId: categoria?.id ?? null,
        name: categoria?.name || 'Sin categoría',
        kind: categoria?.kind || 'OPERATING',
        sortOrder: categoria?.sortOrder ?? 999,
        amount: 0,
        entries: [],
      });
    }

    const linea = porCategoria.get(clave);
    linea.amount = redondear(linea.amount + Number(gasto.amount));
    linea.entries.push({
      id: gasto.id,
      description: gasto.description,
      amount: redondear(gasto.amount),
      occurredOn: gasto.occurredOn,
    });
  });

  const lineas = [...porCategoria.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'es')
  );

  const operatingLines = lineas.filter((linea) => linea.kind === 'OPERATING');
  const financialLines = lineas.filter((linea) => linea.kind === 'FINANCIAL');

  const operatingExpenses = sumar(operatingLines.map((linea) => linea.amount));
  const financialExpenses = sumar(financialLines.map((linea) => linea.amount));

  // Los salarios son un costo operativo más, pero se muestran aparte porque
  // vienen de la nómina y no se cargan a mano.
  const totalOperatingCost = redondear(totalSalary + operatingExpenses);

  // --------------- Saldo ---------------

  const balance = redondear(totalIncome - totalOperatingCost - financialExpenses);

  return {
    month,
    year,
    income: {
      service: serviceIncome,
      other: otherIncome,
      total: totalIncome,
      contracts: contractIncomes,
      otherEntries: otherIncomes.map((linea) => ({
        id: linea.id,
        description: linea.description,
        amount: redondear(linea.amount),
        occurredOn: linea.occurredOn,
      })),
    },
    operating: {
      operationalSalary,
      administrativeSalary,
      totalSalary,
      categories: operatingLines,
      expenses: operatingExpenses,
      total: totalOperatingCost,
    },
    financial: {
      categories: financialLines,
      total: financialExpenses,
    },
    balance,
    payroll,
    /// Si la nómina no está cerrada, el salario, el total operativo y el saldo
    /// son estimaciones. La pantalla los marca con «≈».
    isProvisional,
  };
};

module.exports = { buildStatement, redondear, sumar };
