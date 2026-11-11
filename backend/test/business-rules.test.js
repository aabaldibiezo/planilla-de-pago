const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateBlocks,
  durationHours,
  overtimeAmount,
  calculateDelayMinutes,
  calculateWorkedHours,
} = require('../src/lib/business-rules');

// --------------- Bloques de horario ---------------

test('acepta jornada partida', () => {
  const blocks = validateBlocks([
    { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
    { dayOfWeek: 1, startTime: '14:00', endTime: '18:00' },
  ]);
  assert.equal(blocks.length, 2);
});

test('rechaza bloques solapados', () => {
  assert.throws(
    () =>
      validateBlocks([
        { dayOfWeek: 1, startTime: '08:00', endTime: '12:00' },
        { dayOfWeek: 1, startTime: '11:00', endTime: '14:00' },
      ]),
    /solapados/
  );
});

test('contempla bloque nocturno', () => {
  const [block] = validateBlocks([{ dayOfWeek: 5, startTime: '21:00', endTime: '00:00' }]);
  assert.equal(block.crossesMidnight, true);
  assert.equal(durationHours('21:00', '00:00'), 3);
});

test('rechaza un bloque sin duración', () => {
  assert.throws(
    () => validateBlocks([{ dayOfWeek: 1, startTime: '08:00', endTime: '08:00' }]),
    /no pueden ser iguales/
  );
});

// --------------- Retrasos y horas trabajadas ---------------

test('calcula retraso sin afectar llegada anticipada', () => {
  assert.equal(calculateDelayMinutes('08:00', '08:10'), 10);
  assert.equal(calculateDelayMinutes('08:00', '07:55'), 0);
});

test('calcula horas trabajadas incluyendo turnos nocturnos', () => {
  assert.equal(calculateWorkedHours('08:00', '16:30'), 8.5);
  assert.equal(calculateWorkedHours('22:00', '06:00'), 8);
});

// --------------- Horas extra ---------------

test('calcula horas extra con multiplicador y monto fijo', () => {
  const user = { hourlyRate: 20 };
  assert.equal(overtimeAmount(user, { paymentMode: 'MULTIPLIER', multiplier: 1.5 }, 2), 60);
  assert.equal(overtimeAmount(user, { paymentMode: 'FIXED_AMOUNT', fixedAmount: 75 }, 2), 75);
});

test('no paga las horas compensadas ni las no remuneradas', () => {
  const user = { hourlyRate: 20 };
  assert.equal(overtimeAmount(user, { paymentMode: 'TIME_OFF' }, 3), 0);
  assert.equal(overtimeAmount(user, { paymentMode: 'UNPAID' }, 3), 0);
});

test('exige que el multiplicador sea coherente con la modalidad', () => {
  const user = { hourlyRate: 20 };
  assert.throws(
    () => overtimeAmount(user, { paymentMode: 'LOWER_RATE', multiplier: 1.2 }, 2),
    /menor a 1/
  );
  assert.throws(
    () => overtimeAmount(user, { paymentMode: 'HIGHER_RATE', multiplier: 0.8 }, 2),
    /mayor a 1/
  );
  assert.throws(
    () => overtimeAmount(user, { paymentMode: 'SAME_RATE', multiplier: 1.5 }, 2),
    /multiplicador 1/
  );
  assert.throws(
    () => overtimeAmount(user, { paymentMode: 'MULTIPLIER', multiplier: 0 }, 2),
    /mayor a cero/
  );
});

test('rechaza un monto fijo ausente o no positivo', () => {
  const user = { hourlyRate: 20 };
  assert.throws(() => overtimeAmount(user, { paymentMode: 'FIXED_AMOUNT' }, 2), /monto fijo/);
  assert.throws(
    () => overtimeAmount(user, { paymentMode: 'FIXED_AMOUNT', fixedAmount: 0 }, 2),
    /monto fijo/
  );
});
