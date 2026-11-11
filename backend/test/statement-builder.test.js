const test = require('node:test');
const assert = require('node:assert/strict');

const { buildStatement, redondear } = require('../src/lib/statement-builder');

const CERRADA = { closed: true, expected: 2, paid: 2, missing: 0, reason: null };
const ABIERTA = { closed: false, expected: 3, paid: 1, missing: 2, reason: 'Faltan 2 de 3 pagos de nómina' };

const gasto = (id, nombre, monto, kind = 'OPERATING', sortOrder = 10) => ({
  id,
  description: `Movimiento ${id}`,
  amount: monto,
  occurredOn: null,
  category: { id: sortOrder, name: nombre, kind, sortOrder },
});

const base = (overrides = {}) => ({
  month: 7,
  year: 2026,
  contractIncomes: [],
  otherIncomes: [],
  salaries: {},
  expenses: [],
  payroll: CERRADA,
  ...overrides,
});

// --------------- Casos vacíos ---------------

test('un mes sin datos da todo en cero', () => {
  const e = buildStatement(base());

  assert.equal(e.income.total, 0);
  assert.equal(e.operating.total, 0);
  assert.equal(e.financial.total, 0);
  assert.equal(e.balance, 0);
});

// --------------- Ingresos ---------------

test('suma los contratos y los otros ingresos por separado', () => {
  const e = buildStatement(
    base({
      contractIncomes: [
        { contractId: 1, clientName: 'Torre Norte', contractName: 'Mañana', amount: 4500 },
        { contractId: 2, clientName: 'Torre Sur', contractName: 'Noche', amount: 3200 },
      ],
      otherIncomes: [{ id: 9, description: 'Devolución', amount: 300, occurredOn: null }],
    })
  );

  assert.equal(e.income.service, 7700);
  assert.equal(e.income.other, 300);
  assert.equal(e.income.total, 8000);
});

// --------------- Gastos ---------------

test('agrupa varios movimientos de la misma categoría en una línea', () => {
  const e = buildStatement(
    base({ expenses: [gasto(1, 'Luz', 200), gasto(2, 'Luz', 150)] })
  );

  assert.equal(e.operating.categories.length, 1);
  assert.equal(e.operating.categories[0].name, 'Luz');
  assert.equal(e.operating.categories[0].amount, 350);
  // El detalle sigue disponible para poder borrar un movimiento suelto.
  assert.equal(e.operating.categories[0].entries.length, 2);
});

test('separa costos operativos de gastos financieros', () => {
  const e = buildStatement(
    base({
      expenses: [
        gasto(1, 'Luz', 400, 'OPERATING', 10),
        gasto(2, 'Intereses de préstamo', 600, 'FINANCIAL', 200),
      ],
    })
  );

  assert.equal(e.operating.expenses, 400);
  assert.equal(e.financial.total, 600);
  assert.equal(e.operating.categories.length, 1);
  assert.equal(e.financial.categories.length, 1);
});

test('ordena las categorías por su orden definido', () => {
  const e = buildStatement(
    base({
      expenses: [
        gasto(1, 'Alquiler', 100, 'OPERATING', 30),
        gasto(2, 'Luz', 100, 'OPERATING', 10),
        gasto(3, 'Agua', 100, 'OPERATING', 20),
      ],
    })
  );

  assert.deepEqual(
    e.operating.categories.map((c) => c.name),
    ['Luz', 'Agua', 'Alquiler']
  );
});

test('un gasto sin categoría no se pierde', () => {
  const e = buildStatement(base({ expenses: [{ id: 1, description: 'X', amount: 50, category: null }] }));

  assert.equal(e.operating.categories[0].name, 'Sin categoría');
  assert.equal(e.operating.expenses, 50);
});

// --------------- Salarios ---------------

test('los salarios entran en el costo operativo', () => {
  const e = buildStatement(
    base({ salaries: { OPERATIVO: 9000, ADMINISTRATIVO: 4500 }, expenses: [gasto(1, 'Luz', 400)] })
  );

  assert.equal(e.operating.operationalSalary, 9000);
  assert.equal(e.operating.administrativeSalary, 4500);
  assert.equal(e.operating.totalSalary, 13500);
  assert.equal(e.operating.total, 13900); // 13500 + 400
});

// --------------- Saldo ---------------

test('el saldo resta costos operativos y financieros', () => {
  const e = buildStatement(
    base({
      contractIncomes: [{ contractId: 1, amount: 12700 }],
      otherIncomes: [{ id: 1, description: 'Otro', amount: 850 }],
      salaries: { OPERATIVO: 9000, ADMINISTRATIVO: 0 },
      expenses: [gasto(1, 'Luz', 420, 'OPERATING', 10), gasto(2, 'Intereses', 600, 'FINANCIAL', 200)],
    })
  );

  // 13550 − (9000 + 420) − 600
  assert.equal(e.balance, 3530);
});

test('el saldo puede ser negativo', () => {
  const e = buildStatement(
    base({
      contractIncomes: [{ contractId: 1, amount: 1000 }],
      salaries: { OPERATIVO: 5000 },
    })
  );

  assert.equal(e.balance, -4000);
});

test('no arrastra errores de coma flotante', () => {
  const e = buildStatement(
    base({
      contractIncomes: [{ contractId: 1, amount: 0.1 }, { contractId: 2, amount: 0.2 }],
    })
  );

  assert.equal(e.income.service, 0.3); // no 0.30000000000000004
  assert.equal(redondear(1.005), 1.01);
});

// --------------- Provisionalidad ---------------

test('con la nómina cerrada nada es provisional', () => {
  const e = buildStatement(base({ payroll: CERRADA }));
  assert.equal(e.isProvisional, false);
});

test('con la nómina abierta el estado entero queda provisional', () => {
  // La incertidumbre del salario contamina el total operativo y el saldo:
  // un saldo que parece firme sin serlo es el peor error de esta pantalla.
  const e = buildStatement(base({ payroll: ABIERTA, salaries: { OPERATIVO: 9000 } }));

  assert.equal(e.isProvisional, true);
  assert.equal(e.payroll.missing, 2);
  assert.match(e.payroll.reason, /Faltan 2 de 3/);
});
