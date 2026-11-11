const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizePhone, isEmailLike, isValidPhone } = require('../src/lib/contact');

test('el mismo celular escrito de distintas formas queda igual', () => {
  assert.equal(normalizePhone('71700001'), '71700001');
  assert.equal(normalizePhone('7170-0001'), '71700001');
  assert.equal(normalizePhone('+591 71700001'), '71700001');
  assert.equal(normalizePhone(' 591 717 00 001 '), '71700001');
});

test('un celular vacío queda en null', () => {
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone('   '), null);
  assert.equal(normalizePhone(null), null);
});

test('distingue correo de celular en el campo de acceso', () => {
  assert.equal(isEmailLike('ana@empresa.com'), true);
  assert.equal(isEmailLike('71700001'), false);
});

test('valida celulares bolivianos', () => {
  assert.equal(isValidPhone('71700001'), true);
  assert.equal(isValidPhone('+591 61234567'), true);
  assert.equal(isValidPhone('4412345'), false);
  assert.equal(isValidPhone('81234567'), false);
});
