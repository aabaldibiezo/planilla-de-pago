const test = require('node:test');
const assert = require('node:assert/strict');

const {
  sumarUnMes,
  proximoVencimiento,
  estaVencida,
  diasHastaVencimiento,
  debeAvisar,
  etiquetaDeEstado,
} = require('../src/lib/subscription');

const fecha = (iso) => new Date(`${iso}T00:00:00.000Z`);
const iso = (valor) => new Date(valor).toISOString().slice(0, 10);

// --------------- Suma de un mes ---------------

test('suma un mes en el caso corriente', () => {
  assert.equal(iso(sumarUnMes(fecha('2026-03-15'))), '2026-04-15');
});

test('recorta al último día cuando el mes destino es más corto', () => {
  // Sin el recorte, `setUTCMonth(+1)` sobre el 31 de enero desborda al 3 de
  // marzo y el cobro se corre de mes entero.
  assert.equal(iso(sumarUnMes(fecha('2026-01-31'))), '2026-02-28');
  assert.equal(iso(sumarUnMes(fecha('2026-03-31'))), '2026-04-30');
});

test('respeta el 29 de febrero de un año bisiesto', () => {
  // 2028 es bisiesto.
  assert.equal(iso(sumarUnMes(fecha('2028-01-31'))), '2028-02-29');
});

test('cruza el fin de año', () => {
  assert.equal(iso(sumarUnMes(fecha('2026-12-10'))), '2027-01-10');
});

// --------------- Próximo vencimiento ---------------

test('cuenta desde el vencimiento anterior y no desde la fecha de pago', () => {
  // Vencía el 10, paga el 10: el próximo es el 10 del mes siguiente.
  assert.equal(iso(proximoVencimiento(fecha('2026-05-10'), fecha('2026-05-10'))), '2026-06-10');
});

test('pagar tarde no regala días', () => {
  // Vencía el 10 y paga el 20, con 10 días de atraso. El siguiente vencimiento
  // sigue siendo el 10: si se contara desde el pago, sería el 20 y el ciclo de
  // cobro se iría desplazando mes a mes.
  assert.equal(iso(proximoVencimiento(fecha('2026-05-10'), fecha('2026-05-20'))), '2026-06-10');
});

test('pagar antes del vencimiento tampoco adelanta el ciclo', () => {
  assert.equal(iso(proximoVencimiento(fecha('2026-05-10'), fecha('2026-05-02'))), '2026-06-10');
});

test('con varios meses de atraso avanza hasta superar la fecha de pago', () => {
  // Vencía en enero y recién paga en abril: el próximo vencimiento tiene que
  // quedar por delante del pago, no en el pasado.
  const resultado = proximoVencimiento(fecha('2026-01-10'), fecha('2026-04-15'));
  assert.equal(iso(resultado), '2026-05-10');
  assert.ok(new Date(resultado) > fecha('2026-04-15'));
});

// --------------- Vencimiento ---------------

test('el día del vencimiento todavía cuenta como al día', () => {
  assert.equal(estaVencida(fecha('2026-05-10'), fecha('2026-05-10')), false);
});

test('el día siguiente al vencimiento ya está vencida', () => {
  assert.equal(estaVencida(fecha('2026-05-10'), fecha('2026-05-11')), true);
});

test('cuenta los días que faltan, en negativo si ya pasó', () => {
  assert.equal(diasHastaVencimiento(fecha('2026-05-10'), fecha('2026-05-08')), 2);
  assert.equal(diasHastaVencimiento(fecha('2026-05-10'), fecha('2026-05-10')), 0);
  assert.equal(diasHastaVencimiento(fecha('2026-05-10'), fecha('2026-05-13')), -3);
});

// --------------- Aviso previo ---------------

const empresa = (overrides = {}) => ({
  status: 'ACTIVE',
  nextDueDate: fecha('2026-05-10'),
  reminderSentFor: null,
  ...overrides,
});

test('avisa dentro de la ventana de dos días', () => {
  assert.equal(debeAvisar(empresa(), fecha('2026-05-08')), true);
  assert.equal(debeAvisar(empresa(), fecha('2026-05-09')), true);
  assert.equal(debeAvisar(empresa(), fecha('2026-05-10')), true);
});

test('no avisa antes de la ventana', () => {
  assert.equal(debeAvisar(empresa(), fecha('2026-05-07')), false);
});

test('no vuelve a avisar por el mismo vencimiento', () => {
  // Es lo que hace que el aviso salga una sola vez y no en cada petición.
  const yaAvisada = empresa({ reminderSentFor: fecha('2026-05-10') });
  assert.equal(debeAvisar(yaAvisada, fecha('2026-05-09')), false);
});

test('vuelve a avisar cuando el vencimiento cambia tras un pago', () => {
  // La marca vieja apunta al vencimiento anterior, así que el ciclo nuevo
  // rearma el aviso solo, sin tener que limpiar ninguna bandera.
  const nuevoCiclo = empresa({
    nextDueDate: fecha('2026-06-10'),
    reminderSentFor: fecha('2026-05-10'),
  });
  assert.equal(debeAvisar(nuevoCiclo, fecha('2026-06-09')), true);
});

test('no avisa a una empresa ya suspendida', () => {
  const suspendida = empresa({ status: 'READ_ONLY' });
  assert.equal(debeAvisar(suspendida, fecha('2026-05-09')), false);
});

// --------------- Etiqueta de estado ---------------

test('deriva la etiqueta que muestra el panel', () => {
  assert.equal(etiquetaDeEstado(empresa(), fecha('2026-05-01')), 'ACTIVA');
  assert.equal(etiquetaDeEstado(empresa(), fecha('2026-05-09')), 'POR_VENCER');
  assert.equal(etiquetaDeEstado(empresa({ status: 'READ_ONLY' }), fecha('2026-05-01')), 'SUSPENDIDA');
});
