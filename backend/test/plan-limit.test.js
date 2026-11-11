const test = require('node:test');
const assert = require('node:assert/strict');

const { assertEmployeeQuota, PlanLimitError } = require('../src/services/user.service');

/**
 * Transacción simulada. `assertEmployeeQuota` solo necesita tres cosas de
 * Prisma, así que se sustituyen sin levantar una base: lo que se está probando
 * es la regla del límite, no el acceso a datos.
 */
const txSimulada = ({ maxEmployees, activos }) => {
  const llamadas = { bloqueoDeFila: 0 };

  return {
    llamadas,
    // Etiqueta de plantilla: se invoca como tx.$queryRaw`SELECT ...`
    $queryRaw: (...args) => {
      llamadas.bloqueoDeFila += 1;
      llamadas.sql = String(args[0].join('?'));
      return Promise.resolve([{ id: 1 }]);
    },
    company: {
      findUnique: () =>
        Promise.resolve({
          id: 1,
          plan: { name: 'Esencial', maxEmployees },
        }),
    },
    user: {
      count: () => Promise.resolve(activos),
    },
  };
};

// --------------- El borde exacto ---------------

test('permite el alta cuando queda un cupo libre', async () => {
  // 9 activos en un plan de 10: el décimo entra.
  const tx = txSimulada({ maxEmployees: 10, activos: 9 });
  await assertEmployeeQuota(tx, 1);
});

test('bloquea el alta que superaría el límite', async () => {
  // 10 activos en un plan de 10: el once no entra bajo ninguna circunstancia.
  const tx = txSimulada({ maxEmployees: 10, activos: 10 });

  await assert.rejects(() => assertEmployeeQuota(tx, 1), (error) => {
    assert.equal(error.name, 'PlanLimitError');
    assert.equal(error.code, 'PLAN_LIMIT_REACHED');
    // El mensaje tiene que decir el plan, el tope y el uso actual: es lo que
    // se le muestra al administrador de la empresa.
    assert.match(error.message, /Esencial/);
    assert.match(error.message, /10 empleados activos/);
    assert.match(error.message, /subir de plan/);
    return true;
  });
});

test('bloquea también si de algún modo ya se superó el límite', async () => {
  const tx = txSimulada({ maxEmployees: 10, activos: 14 });
  await assert.rejects(() => assertEmployeeQuota(tx, 1), PlanLimitError);
});

// --------------- Plan ilimitado ---------------

test('el plan ilimitado no aplica ningún tope', async () => {
  // `maxEmployees: null` es "sin límite" (Empresarial). Un número mágico acá
  // obligaría a recordar la convención en cada comparación.
  const tx = txSimulada({ maxEmployees: null, activos: 5000 });
  await assertEmployeeQuota(tx, 1);
});

// --------------- Carrera entre altas simultáneas ---------------

test('bloquea la fila de la empresa antes de contar', async () => {
  // Sin el FOR UPDATE, dos altas a la vez leen ambas "9 de 10" y dejan 11
  // empleados en un plan de 10.
  const tx = txSimulada({ maxEmployees: 10, activos: 1 });
  await assertEmployeeQuota(tx, 1);

  assert.equal(tx.llamadas.bloqueoDeFila, 1);
  assert.match(tx.llamadas.sql, /FOR UPDATE/);
});

test('falla si la empresa no existe', async () => {
  const tx = txSimulada({ maxEmployees: 10, activos: 0 });
  tx.company.findUnique = () => Promise.resolve(null);

  await assert.rejects(() => assertEmployeeQuota(tx, 999), /La empresa no existe/);
});
