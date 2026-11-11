const test = require('node:test');
const assert = require('node:assert/strict');

const { dueDateFor, pendingCollections } = require('../src/lib/collections');

const fecha = (d) => d.toISOString().slice(0, 10);

const contrato = (overrides = {}) => ({
  id: 1,
  isActive: true,
  client: { isActive: true },
  paymentTerms: 'ANTICIPADO',
  billingDay: 5,
  startDate: '2026-09-01',
  endDate: null,
  rates: [{ validFrom: '2026-09-01', amount: 5000 }],
  collections: [],
  ...overrides,
});

test('por adelantado vence el día de cobro del mismo mes', () => {
  assert.equal(fecha(dueDateFor({ paymentTerms: 'ANTICIPADO', billingDay: 5 }, 10, 2026)), '2026-10-05');
});

test('a mes vencido vence el día de cobro del mes siguiente', () => {
  assert.equal(fecha(dueDateFor({ paymentTerms: 'POSTERIOR', billingDay: 5 }, 10, 2026)), '2026-11-05');
  assert.equal(fecha(dueDateFor({ paymentTerms: 'POSTERIOR', billingDay: 10 }, 12, 2026)), '2027-01-10');
});

test('un día de cobro 31 cae el último día en meses cortos', () => {
  assert.equal(fecha(dueDateFor({ paymentTerms: 'ANTICIPADO', billingDay: 31 }, 2, 2026)), '2026-02-28');
});

test('lista los meses sin cobrar, el más atrasado primero', () => {
  const pendientes = pendingCollections([contrato()], '2026-11-02');
  assert.deepEqual(
    pendientes.map((p) => [p.month, p.dueDate, p.overdue, p.daysLate]),
    [
      [9, '2026-09-05', true, 58],
      [10, '2026-10-05', true, 28],
      // Noviembre vence el 5 y hoy es 2: entra en el aviso de 3 días.
      [11, '2026-11-05', false, 0],
    ]
  );
  assert.equal(pendientes[0].amount, 5000);
});

test('un mes cobrado deja de aparecer', () => {
  const pendientes = pendingCollections(
    [contrato({ collections: [{ month: 9, year: 2026 }, { month: 10, year: 2026 }] })],
    '2026-11-02'
  );
  assert.deepEqual(pendientes.map((p) => p.month), [11]);
});

test('todavía no avisa si falta más que el margen', () => {
  const pendientes = pendingCollections(
    [contrato({ collections: [{ month: 9, year: 2026 }, { month: 10, year: 2026 }] })],
    '2026-11-01'
  );
  assert.deepEqual(pendientes, []);
});

test('a mes vencido, el mes en curso todavía no se cobra', () => {
  const pendientes = pendingCollections(
    [contrato({ paymentTerms: 'POSTERIOR', collections: [{ month: 9, year: 2026 }] })],
    '2026-11-02'
  );
  // Octubre vence el 5/11 (dentro del aviso); noviembre recién el 5/12.
  assert.deepEqual(pendientes.map((p) => [p.month, p.dueDate]), [[10, '2026-11-05']]);
});

test('no cobra antes del inicio ni después del fin del contrato', () => {
  const pendientes = pendingCollections(
    [contrato({ startDate: '2026-10-15', endDate: '2026-10-31' })],
    '2026-11-02'
  );
  assert.deepEqual(pendientes.map((p) => p.month), [10]);
});

test('sin monto cargado no hay qué cobrar', () => {
  assert.deepEqual(pendingCollections([contrato({ rates: [] })], '2026-11-02'), []);
});

test('un contrato o cliente dado de baja no se recuerda', () => {
  assert.deepEqual(pendingCollections([contrato({ isActive: false })], '2026-11-02'), []);
  assert.deepEqual(
    pendingCollections([contrato({ client: { isActive: false } })], '2026-11-02'),
    []
  );
});

test('sin fecha de inicio revisa solo los últimos meses', () => {
  const pendientes = pendingCollections(
    [contrato({ startDate: null, rates: [{ validFrom: '2025-01-01', amount: 100 }] })],
    '2026-11-02'
  );
  assert.equal(pendientes[0].month, 5);
  assert.equal(pendientes.length, 7);
});
