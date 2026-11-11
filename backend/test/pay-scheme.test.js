const test = require('node:test');
const assert = require('node:assert/strict');

const {
  dailyRateFor,
  hourlyRateFor,
  basePayFor,
  extraDayRateFor,
} = require('../src/lib/pay-scheme');

const fijo = { employeeType: 'FIJO', monthlySalary: 3000, monthlyHours: 240, dailyWage: 0 };
const temporal = { employeeType: 'TEMPORAL', monthlySalary: 0, monthlyHours: 240, dailyWage: 120 };

test('el fijo cobra el sueldo del mes aunque haya marcado pocos días', () => {
  assert.deepEqual(basePayFor(fijo, ['2026-10-01']), {
    amount: 3000,
    daysWorked: null,
    dailyRate: null,
  });
});

test('el temporal cobra los días que marcó por su pago por día', () => {
  assert.deepEqual(basePayFor(temporal, ['2026-10-01', '2026-10-02', '2026-10-05']), {
    amount: 360,
    daysWorked: 3,
    dailyRate: 120,
  });
});

test('dos marcaciones el mismo día son un solo día pagado', () => {
  const pago = basePayFor(temporal, [
    new Date('2026-10-01T00:00:00.000Z'),
    '2026-10-01',
    '2026-10-02',
  ]);
  assert.equal(pago.daysWorked, 2);
  assert.equal(pago.amount, 240);
});

test('un temporal sin marcaciones cobra cero', () => {
  assert.equal(basePayFor(temporal, []).amount, 0);
});

test('el jornal del fijo es sueldo ÷ 30 y el del temporal su pago por día', () => {
  assert.equal(dailyRateFor(fijo), 100);
  assert.equal(dailyRateFor(temporal), 120);
});

test('el valor de la hora sale de la jornada de 8 horas', () => {
  assert.equal(hourlyRateFor(fijo), 12.5);
  assert.equal(hourlyRateFor(temporal), 15);
});

test('día extra: el fijo cobra el jornal entero por el factor', () => {
  assert.equal(extraDayRateFor(fijo, 2), 200);
});

test('día extra: el temporal ya cobró el día, se suma solo la diferencia', () => {
  // Con pago doble, el domingo le queda en 240: 120 del día + 120 extra.
  assert.equal(extraDayRateFor(temporal, 2), 120);
  assert.equal(extraDayRateFor(temporal, 1), 0);
});
