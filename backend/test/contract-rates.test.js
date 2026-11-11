const test = require('node:test');
const assert = require('node:assert/strict');

const { rateForMonth, currentRate, endOfMonth } = require('../src/lib/contract-rates');

/** Monto con fecha de vigencia, tal como sale de la base. */
const tarifa = (validFrom, amount) => ({ validFrom: new Date(`${validFrom}T00:00:00.000Z`), amount });

// --------------- Sin datos ---------------

test('un contrato sin montos cargados no tiene precio', () => {
  // null, no cero: un contrato recién creado no vale 0, no tiene precio aún.
  assert.equal(rateForMonth([], 7, 2026), null);
  assert.equal(rateForMonth(null, 7, 2026), null);
  assert.equal(rateForMonth(undefined, 7, 2026), null);
});

// --------------- Selección básica ---------------

test('con un solo monto anterior, ese rige', () => {
  const rates = [tarifa('2026-01-01', 3500)];
  assert.equal(rateForMonth(rates, 7, 2026).amount, 3500);
});

test('elige el más reciente de los que ya empezaron', () => {
  const rates = [
    tarifa('2026-01-01', 3500),
    tarifa('2026-04-01', 4000),
    tarifa('2026-06-01', 4200),
  ];
  assert.equal(rateForMonth(rates, 7, 2026).amount, 4200);
});

test('no depende del orden en que vengan los montos', () => {
  const desordenados = [
    tarifa('2026-06-01', 4200),
    tarifa('2026-01-01', 3500),
    tarifa('2026-04-01', 4000),
  ];
  assert.equal(rateForMonth(desordenados, 5, 2026).amount, 4000);
});

// --------------- Bordes de mes ---------------

test('un monto que entra el día 1 rige ese mismo mes', () => {
  const rates = [tarifa('2026-01-01', 3500), tarifa('2026-07-01', 4500)];
  assert.equal(rateForMonth(rates, 7, 2026).amount, 4500);
  // Y el mes anterior sigue con el viejo.
  assert.equal(rateForMonth(rates, 6, 2026).amount, 3500);
});

test('un ajuste a mitad de mes rige para el mes completo', () => {
  // El contrato se cobra mensualmente: no se prorratea.
  const rates = [tarifa('2026-01-01', 3500), tarifa('2026-07-15', 4500)];
  assert.equal(rateForMonth(rates, 7, 2026).amount, 4500);
});

test('un monto que entra el último día del mes ya rige ese mes', () => {
  const rates = [tarifa('2026-01-01', 3500), tarifa('2026-07-31', 4800)];
  assert.equal(rateForMonth(rates, 7, 2026).amount, 4800);
});

test('reconoce el último día de un febrero bisiesto', () => {
  // 2028 es bisiesto: el 29 existe y debe entrar dentro del mes.
  const rates = [tarifa('2028-02-29', 5000)];
  assert.equal(rateForMonth(rates, 2, 2028).amount, 5000);
  assert.equal(endOfMonth(2, 2028).getUTCDate(), 29);
  assert.equal(endOfMonth(2, 2026).getUTCDate(), 28);
});

// --------------- Futuro ---------------

test('un monto con fecha futura todavía no se aplica', () => {
  const rates = [tarifa('2026-01-01', 3500), tarifa('2026-09-01', 5000)];
  assert.equal(rateForMonth(rates, 7, 2026).amount, 3500);
});

test('si todos los montos son futuros, el mes no tiene precio', () => {
  const rates = [tarifa('2027-01-01', 5000)];
  assert.equal(rateForMonth(rates, 7, 2026), null);
});

test('consultar un mes anterior al primer monto no devuelve nada', () => {
  // El historial no se inventa hacia atrás.
  const rates = [tarifa('2026-05-01', 4000)];
  assert.equal(rateForMonth(rates, 3, 2026), null);
});

// --------------- Cambio de año ---------------

test('cruza el cambio de año correctamente', () => {
  const rates = [tarifa('2025-11-01', 3000), tarifa('2026-02-01', 3600)];
  assert.equal(rateForMonth(rates, 12, 2025).amount, 3000);
  assert.equal(rateForMonth(rates, 1, 2026).amount, 3000);
  assert.equal(rateForMonth(rates, 2, 2026).amount, 3600);
});

// --------------- Atajo del listado ---------------

test('currentRate toma el vigente hoy', () => {
  const hoy = new Date();
  const añoPasado = `${hoy.getUTCFullYear() - 1}-01-01`;
  const añoQueViene = `${hoy.getUTCFullYear() + 1}-01-01`;

  const rates = [tarifa(añoPasado, 3500), tarifa(añoQueViene, 9999)];
  assert.equal(currentRate(rates).amount, 3500);
});
