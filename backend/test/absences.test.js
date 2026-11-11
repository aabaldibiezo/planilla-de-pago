const test = require('node:test');
const assert = require('node:assert/strict');

const { missingWorkDays } = require('../src/lib/absences');

// Octubre de 2026 empieza en jueves. Turno de lunes a viernes.
const LUNES_A_VIERNES = [1, 2, 3, 4, 5];

test('cuenta los días con turno que no tienen marcación', () => {
  const faltas = missingWorkDays({
    year: 2026,
    month: 10,
    workDays: LUNES_A_VIERNES,
    workedDates: ['2026-10-01', '2026-10-02'],
    today: '2026-10-08',
  });
  // Lunes 5, martes 6 y miércoles 7; el sábado 3 y el domingo 4 no tienen turno.
  assert.deepEqual(faltas, ['2026-10-05', '2026-10-06', '2026-10-07']);
});

test('el día de hoy no cuenta porque todavía no terminó', () => {
  const faltas = missingWorkDays({
    year: 2026,
    month: 10,
    workDays: LUNES_A_VIERNES,
    workedDates: ['2026-10-01'],
    today: '2026-10-02',
  });
  assert.deepEqual(faltas, []);
});

test('no cuenta los días anteriores al alta del empleado', () => {
  const faltas = missingWorkDays({
    year: 2026,
    month: 10,
    workDays: LUNES_A_VIERNES,
    workedDates: [],
    from: '2026-10-07T15:30:00.000Z',
    today: '2026-10-09',
  });
  assert.deepEqual(faltas, ['2026-10-07', '2026-10-08']);
});

test('un mes ya cerrado se revisa completo', () => {
  const faltas = missingWorkDays({
    year: 2026,
    month: 2,
    workDays: [6],
    workedDates: ['2026-02-07', '2026-02-14', '2026-02-21'],
    today: '2026-11-01',
  });
  assert.deepEqual(faltas, ['2026-02-28']);
});

test('sin días de turno cargados no avisa nada', () => {
  // Un empleado sin horario no tiene contra qué compararse.
  const faltas = missingWorkDays({
    year: 2026,
    month: 10,
    workDays: [],
    workedDates: [],
    today: '2026-11-01',
  });
  assert.deepEqual(faltas, []);
});

test('acepta las fechas de marcación como Date', () => {
  const faltas = missingWorkDays({
    year: 2026,
    month: 10,
    workDays: [1],
    workedDates: [new Date('2026-10-05T00:00:00.000Z'), new Date('2026-10-12T00:00:00.000Z')],
    today: '2026-10-20',
  });
  assert.deepEqual(faltas, ['2026-10-19']);
});
