const test = require('node:test');
const assert = require('node:assert/strict');

const { buildEconomicDetail } = require('../src/lib/economic-detail');

const usuario = (firstName, extra = {}) => ({
  id: firstName.length,
  firstName,
  lastName: 'Prueba',
  staffCategory: 'OPERATIVO',
  employeeType: 'FIJO',
  ...extra,
});

const datos = () => ({
  today: '2026-11-10',
  contracts: [
    {
      contractId: 1,
      clientName: 'Torre Norte',
      contractName: 'Turno mañana',
      amount: 5200,
      dueDate: '2026-11-05',
      collection: { amount: 5200, collectedOn: '2026-11-04' },
    },
    { contractId: 2, clientName: 'Gasolinera', contractName: 'Playa', amount: 6800, dueDate: '2026-11-05' },
    { contractId: 3, clientName: 'Clínica', contractName: 'Pisos', amount: 3000, dueDate: '2026-12-05' },
  ],
  otherIncome: 300,
  payments: [
    {
      userId: 1,
      user: usuario('Rosa'),
      totalIncome: 3200,
      netPay: 2700,
      paidAt: '2026-11-08',
      details: [
        { type: 'DISCOUNT', code: 'SALARY_ADVANCE', amount: 450 },
        { type: 'DISCOUNT', code: 'UNJUSTIFIED_DELAY', amount: 50 },
      ],
    },
  ],
  drafts: [
    {
      user: usuario('Carla'),
      payScheme: 'MONTHLY',
      totalIncome: 3000,
      netPay: 2772,
      discountAmount: 0,
      discounts: [{ type: 'COMPANY_DAMAGE', amount: 228 }],
    },
    // Temporal que no vino ningún día: no figura.
    { user: usuario('Pedro', { employeeType: 'TEMPORAL' }), payScheme: 'DAILY', daysWorked: 0, netPay: 0 },
  ],
  expenses: 400,
});

test('separa lo cobrado de lo que falta cobrar y marca lo vencido', () => {
  const { collections } = buildEconomicDetail(datos());
  assert.equal(collections.collected, 5200);
  assert.equal(collections.pending, 9800);
  const gasolinera = collections.lines.find((c) => c.contractId === 2);
  assert.equal(gasolinera.status, 'POR_COBRAR');
  assert.equal(gasolinera.overdue, true);
  assert.equal(collections.lines.find((c) => c.contractId === 3).overdue, false);
});

test('separa sueldos pagados de los que faltan pagar, por persona', () => {
  const { salaries } = buildEconomicDetail(datos());
  assert.equal(salaries.paid, 2700);
  assert.equal(salaries.pending, 2772);
  assert.deepEqual(
    salaries.lines.map((s) => [s.name, s.status]),
    [
      ['Carla Prueba', 'POR_PAGAR'],
      ['Rosa Prueba', 'PAGADO'],
    ]
  );
});

test('suma los descuentos a empleados por tipo', () => {
  const { employeeDiscounts } = buildEconomicDetail(datos());
  assert.equal(employeeDiscounts.byType.SALARY_ADVANCE, 450);
  assert.equal(employeeDiscounts.byType.UNJUSTIFIED_DELAY, 50);
  assert.equal(employeeDiscounts.byType.COMPANY_DAMAGE, 228);
  assert.equal(employeeDiscounts.total, 728);
});

test('caja de hoy y resultado esperado al cerrar el mes', () => {
  const { cash, expected } = buildEconomicDetail(datos());
  // Entró: 5200 cobrado + 300 otros. Salió: 2700 sueldo + 400 gastos.
  assert.deepEqual(cash, { in: 5500, out: 3100, balance: 2400 });
  // Esperado: 15000 + 300 de ingresos; 2700 + 2772 + 400 de egresos.
  assert.deepEqual(expected, { income: 15300, outcome: 5872, balance: 9428 });
});

test('un pago viejo sin detalle cuenta su descuento como retraso', () => {
  const { salaries } = buildEconomicDetail({
    today: '2026-07-20',
    payments: [{ userId: 9, user: usuario('Carlos'), netPay: 4476.65, discountAmount: 23.35, details: [] }],
  });
  assert.equal(salaries.lines[0].discounts.UNJUSTIFIED_DELAY, 23.35);
});
