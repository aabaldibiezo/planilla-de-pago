const test = require('node:test');
const assert = require('node:assert/strict');

const { contratosPorVencer } = require('../src/lib/contract-expiry');

const hoy = new Date('2026-11-23T15:00:00.000Z');
const c = (id, endDate, extra = {}) => ({ id, endDate, isActive: true, ...extra });

test('avisa un contrato que vence dentro de 2 semanas', () => {
  const r = contratosPorVencer([c(1, '2026-12-07')], hoy);
  assert.deepEqual(r, [{ contractId: 1, endDate: '2026-12-07', daysLeft: 14, expired: false }]);
});

test('no avisa uno que vence en 15 días o más', () => {
  assert.deepEqual(contratosPorVencer([c(1, '2026-12-08')], hoy), []);
});

test('avisa el que vence hoy', () => {
  assert.equal(contratosPorVencer([c(1, '2026-11-23')], hoy)[0].daysLeft, 0);
});

test('un contrato vencido hace poco y todavía activo se avisa como vencido', () => {
  const [r] = contratosPorVencer([c(1, '2026-11-13')], hoy);
  assert.equal(r.expired, true);
  assert.equal(r.daysLeft, -10);
});

test('vencido hace más de 30 días ya no se avisa', () => {
  assert.deepEqual(contratosPorVencer([c(1, '2026-10-01')], hoy), []);
});

test('sin fecha de fin o dado de baja no se avisa', () => {
  assert.deepEqual(contratosPorVencer([c(1, null), c(2, '2026-11-30', { isActive: false })], hoy), []);
});

test('ordena del más urgente al menos urgente', () => {
  const r = contratosPorVencer([c(1, '2026-12-05'), c(2, '2026-11-20'), c(3, '2026-11-25')], hoy);
  assert.deepEqual(r.map((x) => x.contractId), [2, 3, 1]);
});
