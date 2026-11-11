const test = require('node:test');
const assert = require('node:assert/strict');

const {
  payrollClosure,
  expectedEmployees,
  monthHasEnded,
  endOfMonth,
} = require('../src/lib/payroll-closure');

const empleado = (id, overrides = {}) => ({
  id,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

const pago = (userId) => ({ userId });

// Momentos fijos, para que las pruebas no cambien de resultado con el tiempo.
const DENTRO_DE_JULIO = new Date('2026-07-15T12:00:00.000Z');
const YA_PASO_JULIO = new Date('2026-08-15T12:00:00.000Z');

// --------------- Fin de mes ---------------

test('reconoce el último día de cada mes', () => {
  assert.equal(endOfMonth(7, 2026).getUTCDate(), 31);
  assert.equal(endOfMonth(2, 2026).getUTCDate(), 28);
  assert.equal(endOfMonth(2, 2028).getUTCDate(), 29); // bisiesto
});

test('el mes en curso no ha terminado', () => {
  assert.equal(monthHasEnded(7, 2026, DENTRO_DE_JULIO), false);
  assert.equal(monthHasEnded(7, 2026, YA_PASO_JULIO), true);
});

// --------------- Quiénes debían cobrar ---------------

test('cuenta a los empleados activos que ya existían', () => {
  const empleados = [empleado(1), empleado(2), empleado(3)];
  assert.equal(expectedEmployees(empleados, [], 7, 2026).length, 3);
});

test('un alta posterior al mes no ensucia ese mes', () => {
  // Contratado en septiembre: no debía cobrar julio.
  const empleados = [empleado(1), empleado(2, { createdAt: '2026-09-10' })];
  const esperados = expectedEmployees(empleados, [], 7, 2026);

  assert.equal(esperados.length, 1);
  assert.equal(esperados[0].id, 1);
});

test('quien cobró y después se fue sigue contando', () => {
  // Su sueldo es parte del costo de julio aunque hoy esté inactivo.
  const empleados = [empleado(1), empleado(2, { isActive: false })];
  const esperados = expectedEmployees(empleados, [pago(2)], 7, 2026);

  assert.equal(esperados.length, 2);
});

test('quien se fue sin cobrar no cuenta', () => {
  // No hay fecha de baja en el modelo; se prefiere no inventarla.
  const empleados = [empleado(1), empleado(2, { isActive: false })];
  assert.equal(expectedEmployees(empleados, [], 7, 2026).length, 1);
});

// --------------- Cierre ---------------

test('mes terminado con todos los pagos: cerrada', () => {
  const r = payrollClosure(
    [empleado(1), empleado(2)],
    [pago(1), pago(2)],
    7,
    2026,
    YA_PASO_JULIO
  );

  assert.equal(r.closed, true);
  assert.equal(r.missing, 0);
  assert.equal(r.paid, 2);
  assert.equal(r.reason, null);
});

test('mes terminado con pagos faltantes: no cerrada', () => {
  const r = payrollClosure(
    [empleado(1), empleado(2), empleado(3)],
    [pago(1)],
    7,
    2026,
    YA_PASO_JULIO
  );

  assert.equal(r.closed, false);
  assert.equal(r.expected, 3);
  assert.equal(r.paid, 1);
  assert.equal(r.missing, 2);
  assert.match(r.reason, /Faltan 2 de 3/);
});

test('mes EN CURSO con todos los pagos: sigue sin cerrar', () => {
  // Aunque estén todos pagados, julio no terminó: puede entrar personal o
  // registrarse horas extra que cambien un monto ya pagado.
  const r = payrollClosure(
    [empleado(1), empleado(2)],
    [pago(1), pago(2)],
    7,
    2026,
    DENTRO_DE_JULIO
  );

  assert.equal(r.closed, false);
  assert.equal(r.missing, 0);
  assert.match(r.reason, /en curso/);
});

test('sin empleados no hay nómina que esperar', () => {
  const terminado = payrollClosure([], [], 7, 2026, YA_PASO_JULIO);
  assert.equal(terminado.closed, true);
  assert.equal(terminado.expected, 0);

  const enCurso = payrollClosure([], [], 7, 2026, DENTRO_DE_JULIO);
  assert.equal(enCurso.closed, false);
});

test('un mes futuro nunca está cerrado', () => {
  const r = payrollClosure([empleado(1)], [], 12, 2026, DENTRO_DE_JULIO);
  assert.equal(r.closed, false);
});

test('no cuenta pagos de gente que no correspondía a ese mes', () => {
  // Un pago suelto de alguien contratado después no debe inflar el conteo.
  const empleados = [empleado(1), empleado(2, { createdAt: '2026-09-10' })];
  const r = payrollClosure(empleados, [pago(1)], 7, 2026, YA_PASO_JULIO);

  assert.equal(r.expected, 1);
  assert.equal(r.paid, 1);
  assert.equal(r.closed, true);
});
