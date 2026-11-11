const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateTemporaryPassword,
  assertPasswordStrength,
  ALPHABET,
} = require('../src/lib/credentials');

// --------------- Contraseña temporal ---------------

test('genera contraseñas de la longitud pedida', () => {
  assert.equal(generateTemporaryPassword().length, 10);
  assert.equal(generateTemporaryPassword(16).length, 16);
});

test('excluye caracteres ambiguos para que se puedan tipear en un celular', () => {
  const ambiguos = ['0', 'O', '1', 'l', 'I', '5', 'S'];
  for (const caracter of ambiguos) {
    assert.equal(ALPHABET.includes(caracter), false, `El alfabeto no debe incluir "${caracter}"`);
  }

  // Muestra amplia: ningún carácter generado cae fuera del alfabeto.
  for (let i = 0; i < 500; i += 1) {
    for (const caracter of generateTemporaryPassword()) {
      assert.ok(ALPHABET.includes(caracter), `Carácter inesperado: "${caracter}"`);
    }
  }
});

test('no repite la misma contraseña', () => {
  const generadas = new Set();
  for (let i = 0; i < 200; i += 1) {
    generadas.add(generateTemporaryPassword());
  }
  assert.equal(generadas.size, 200);
});

test('la contraseña temporal satisface su propia política de fortaleza', () => {
  // Evita el absurdo de generar una contraseña que el sistema luego rechazaría.
  for (let i = 0; i < 200; i += 1) {
    assert.doesNotThrow(() => assertPasswordStrength(generateTemporaryPassword()));
  }
});

// --------------- Política de contraseñas ---------------

test('acepta una contraseña con letras y números', () => {
  assert.doesNotThrow(() => assertPasswordStrength('limpieza2026'));
});

test('rechaza contraseñas cortas', () => {
  assert.throws(() => assertPasswordStrength('abc123'), /al menos 8 caracteres/);
});

test('rechaza contraseñas sin números o sin letras', () => {
  assert.throws(() => assertPasswordStrength('solamenteletras'), /letras y números/);
  assert.throws(() => assertPasswordStrength('123456789'), /letras y números/);
});

test('rechaza valores que no son texto', () => {
  assert.throws(() => assertPasswordStrength(null), /al menos 8 caracteres/);
  assert.throws(() => assertPasswordStrength(undefined), /al menos 8 caracteres/);
  assert.throws(() => assertPasswordStrength(12345678), /al menos 8 caracteres/);
});
