const test = require('node:test');
const assert = require('node:assert/strict');

const {
  pascua,
  nationalHolidays,
  holidaysForMonth,
  extraWorkDays,
  extraDayAmount,
} = require('../src/lib/holidays');

const fecha = (d) => d.toISOString().slice(0, 10);

test('calcula la Pascua de años conocidos', () => {
  assert.equal(fecha(pascua(2025)), '2025-04-20');
  assert.equal(fecha(pascua(2026)), '2026-04-05');
  assert.equal(fecha(pascua(2027)), '2027-03-28');
});

test('los feriados móviles de 2026 caen en su fecha', () => {
  const porNombre = Object.fromEntries(nationalHolidays(2026).map((f) => [f.name, f.date]));
  assert.equal(porNombre['Carnaval (lunes)'], '2026-02-16');
  assert.equal(porNombre['Carnaval (martes)'], '2026-02-17');
  assert.equal(porNombre['Viernes Santo'], '2026-04-03');
  assert.equal(porNombre['Corpus Christi'], '2026-06-04');
});

test('el mes junta los nacionales con los de la empresa', () => {
  const sep = holidaysForMonth(2026, 9, [
    { date: '2026-09-14', name: 'Feriado departamental de Cochabamba' },
    { date: '2026-10-12', name: 'Otro mes' },
  ]);
  assert.deepEqual([...sep.keys()], ['2026-09-14']);

  const nov = holidaysForMonth(2026, 11);
  assert.equal(nov.get('2026-11-02'), 'Todos Santos');
});

test('un domingo de descanso trabajado es día extra', () => {
  // Turno de lunes a sábado; el domingo 6 la llamaron.
  const extras = extraWorkDays({
    workedDates: ['2026-09-05', '2026-09-06', '2026-09-07'],
    workDays: [1, 2, 3, 4, 5, 6],
    holidays: new Map(),
  });
  assert.deepEqual(extras, [{ date: '2026-09-06', reason: 'Domingo' }]);
});

test('si el contrato incluye el domingo, no es extra', () => {
  const extras = extraWorkDays({
    workedDates: ['2026-09-06'],
    workDays: [0, 1, 2, 3, 4, 5, 6],
    holidays: new Map(),
  });
  assert.deepEqual(extras, []);
});

test('un feriado trabajado es extra aunque sea día de turno', () => {
  const extras = extraWorkDays({
    workedDates: ['2026-09-14'],
    workDays: [1, 2, 3, 4, 5, 6],
    holidays: new Map([['2026-09-14', 'Feriado departamental']]),
  });
  assert.deepEqual(extras, [{ date: '2026-09-14', reason: 'Feriado: Feriado departamental' }]);
});

test('dos marcaciones el mismo día cuentan una sola vez', () => {
  const extras = extraWorkDays({
    workedDates: [new Date('2026-09-06T00:00:00.000Z'), '2026-09-06'],
    workDays: [1, 2, 3, 4, 5, 6],
    holidays: new Map(),
  });
  assert.equal(extras.length, 1);
});

test('sin horario cargado, solo el domingo es fuera de turno', () => {
  const extras = extraWorkDays({
    workedDates: ['2026-09-05', '2026-09-06'],
    workDays: [],
    holidays: new Map(),
  });
  assert.deepEqual(extras, [{ date: '2026-09-06', reason: 'Domingo' }]);
});

test('el día extra vale un jornal por el factor', () => {
  assert.equal(extraDayAmount(3000), 200);
  assert.equal(extraDayAmount(3000, 1), 100);
  assert.equal(extraDayAmount(3100, 1.5), 155);
});
