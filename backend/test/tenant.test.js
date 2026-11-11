const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  scope,
  companyOf,
  TENANT_PATH,
  PLATFORM_MODELS,
  NESTED_MODELS,
} = require('../src/lib/tenant');

// --------------- Cobertura contra el esquema ---------------

/** Nombres de modelo tal como los expone el cliente Prisma (primera letra minúscula). */
const modelosDelEsquema = () => {
  const schema = fs.readFileSync(
    path.join(__dirname, '../prisma/schema.prisma'),
    'utf8'
  );

  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map(
    ([, nombre]) => nombre[0].toLowerCase() + nombre.slice(1)
  );
};

/**
 * Esta es la prueba que sostiene el aislamiento a lo largo del tiempo.
 *
 * Si mañana alguien agrega un modelo al esquema y no decide explícitamente si
 * pertenece a una empresa, a la plataforma o a un padre, esta prueba falla. Sin
 * ella, el modelo nuevo simplemente quedaría sin filtrar y nadie se enteraría
 * hasta que una empresa viera datos de otra.
 */
test('todo modelo del esquema está clasificado en lib/tenant.js', () => {
  const clasificados = new Set([
    ...Object.keys(TENANT_PATH),
    ...PLATFORM_MODELS,
    ...NESTED_MODELS,
  ]);

  const sinClasificar = modelosDelEsquema().filter((modelo) => !clasificados.has(modelo));

  assert.deepEqual(
    sinClasificar,
    [],
    `Modelos sin ámbito decidido: ${sinClasificar.join(', ')}. ` +
      'Agréguelos a TENANT_PATH, PLATFORM_MODELS o NESTED_MODELS en src/lib/tenant.js.'
  );
});

test('no se clasifica un modelo que ya no existe en el esquema', () => {
  const delEsquema = new Set(modelosDelEsquema());
  const clasificados = [...Object.keys(TENANT_PATH), ...PLATFORM_MODELS, ...NESTED_MODELS];

  const fantasmas = clasificados.filter((modelo) => !delEsquema.has(modelo));

  assert.deepEqual(fantasmas, [], `Modelos clasificados que ya no existen: ${fantasmas.join(', ')}`);
});

// --------------- scope() ---------------

test('acota por columna directa los modelos que guardan la empresa', () => {
  assert.deepEqual(scope('user', 7), { companyId: 7 });
  assert.deepEqual(scope('worksite', 7), { companyId: 7 });
  assert.deepEqual(scope('auditLog', 7), { companyId: 7 });
});

test('acota por la relación con el usuario el resto de los modelos', () => {
  assert.deepEqual(scope('payment', 3), { user: { companyId: 3 } });
  assert.deepEqual(scope('attendanceSession', 3), { user: { companyId: 3 } });
  assert.deepEqual(scope('timeCompensation', 3), { user: { companyId: 3 } });
});

test('rechaza un modelo sin ámbito definido en vez de devolver un filtro vacío', () => {
  // Un `{}` acá devolvería los datos de todas las empresas.
  assert.throws(() => scope('inventado', 1), /no tiene ámbito de empresa definido/);
  assert.throws(() => scope('company', 1), /no tiene ámbito de empresa definido/);
});

test('rechaza una consulta sin empresa en contexto', () => {
  const sinEmpresa = [null, undefined, 0, -1, '5', NaN, 1.5];

  sinEmpresa.forEach((valor) => {
    assert.throws(
      () => scope('payment', valor),
      /sin empresa en el contexto/,
      `Debió rechazar companyId = ${String(valor)}`
    );
  });
});

// --------------- companyOf() ---------------

test('devuelve la empresa de un usuario de empresa', () => {
  assert.equal(companyOf({ id: 1, role: 'ADMIN', companyId: 4 }), 4);
});

test('rechaza al súper administrador, que no pertenece a ninguna empresa', () => {
  // No es un caso a contemplar: que lance es justamente lo que impide que el
  // súper administrador alcance datos operativos de una empresa.
  assert.throws(
    () => companyOf({ id: 1, role: 'SUPER_ADMIN', companyId: null }),
    /no pertenece a ninguna empresa/
  );
  assert.throws(() => companyOf(null), /no pertenece a ninguna empresa/);
});
