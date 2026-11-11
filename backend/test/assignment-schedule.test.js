const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findConflict,
  describeConflict,
  dentroDeLaJornada,
  ventana,
  DIA_COMPLETO,
} = require('../src/lib/assignment-schedule');

const MARTES = 2;
const MIERCOLES = 3;

/** Asignación recurrente por día de la semana. */
const recurrente = (overrides = {}) => ({
  id: 1,
  dayOfWeek: MARTES,
  specificDate: null,
  startTime: null,
  endTime: null,
  validFrom: '2026-01-01',
  validUntil: null,
  isActive: true,
  worksite: { name: 'Torre Norte' },
  ...overrides,
});

/** Asignación para una fecha concreta. */
const puntual = (fecha, overrides = {}) =>
  recurrente({ dayOfWeek: null, specificDate: fecha, ...overrides });

// --------------- Franjas ---------------

test('una asignación sin horario ocupa el día entero', () => {
  assert.deepEqual(ventana(recurrente()), DIA_COMPLETO);
});

test('una asignación con horario ocupa solo su franja', () => {
  assert.deepEqual(ventana(recurrente({ startTime: '08:00', endTime: '12:00' })), [480, 720]);
});

// --------------- Cruce entre sedes ---------------

test('dos franjas que se pisan chocan', () => {
  const candidata = recurrente({ id: null, startTime: '10:00', endTime: '14:00' });
  const existentes = [recurrente({ id: 5, startTime: '08:00', endTime: '12:00' })];

  const conflicto = findConflict(candidata, existentes);
  assert.equal(conflicto?.id, 5);
});

test('dos franjas contiguas NO chocan', () => {
  // 08:00-12:00 seguido de 12:00-16:00 es un turno encadenado, no un choque.
  const candidata = recurrente({ id: null, startTime: '12:00', endTime: '16:00' });
  const existentes = [recurrente({ id: 5, startTime: '08:00', endTime: '12:00' })];

  assert.equal(findConflict(candidata, existentes), null);
});

test('una asignación sin horario choca con cualquiera del mismo día', () => {
  // Es el caso de los datos que ya existen: sin horas, ocupan todo el día.
  const candidata = recurrente({ id: null, startTime: '08:00', endTime: '09:00' });
  const existentes = [recurrente({ id: 5 })];

  assert.equal(findConflict(candidata, existentes)?.id, 5);
});

test('días de la semana distintos no chocan', () => {
  const candidata = recurrente({ id: null, dayOfWeek: MIERCOLES });
  const existentes = [recurrente({ id: 5, dayOfWeek: MARTES })];

  assert.equal(findConflict(candidata, existentes), null);
});

test('no choca consigo misma al editar', () => {
  const candidata = recurrente({ id: 5, startTime: '08:00', endTime: '12:00' });
  const existentes = [recurrente({ id: 5, startTime: '08:00', endTime: '12:00' })];

  assert.equal(findConflict(candidata, existentes), null);
});

test('una asignación dada de baja no genera conflicto', () => {
  const candidata = recurrente({ id: null });
  const existentes = [recurrente({ id: 5, isActive: false })];

  assert.equal(findConflict(candidata, existentes), null);
});

// --------------- Puntual contra recurrente ---------------

test('una fecha puntual NO choca con una recurrente del mismo día de semana', () => {
  // `worksitesForDate` en geofence.js le da prioridad a la puntual y descarta
  // las recurrentes de esa fecha. Marcar conflicto acá haría que la validación
  // dijera una cosa y el geocerco hiciera otra.
  const candidata = puntual('2026-08-11', { id: null }); // un martes
  const existentes = [recurrente({ id: 5, dayOfWeek: MARTES })];

  assert.equal(findConflict(candidata, existentes), null);
});

test('dos puntuales de la misma fecha sí chocan', () => {
  const candidata = puntual('2026-08-11', { id: null, startTime: '08:00', endTime: '12:00' });
  const existentes = [puntual('2026-08-11', { id: 5, startTime: '10:00', endTime: '14:00' })];

  assert.equal(findConflict(candidata, existentes)?.id, 5);
});

test('dos puntuales de fechas distintas no chocan', () => {
  const candidata = puntual('2026-08-11', { id: null });
  const existentes = [puntual('2026-08-12', { id: 5 })];

  assert.equal(findConflict(candidata, existentes), null);
});

// --------------- Vigencias ---------------

test('vigencias que no se cruzan no generan conflicto', () => {
  // Estuvo en una sede hasta marzo y en otra desde abril, los dos martes.
  const candidata = recurrente({ id: null, validFrom: '2026-04-01' });
  const existentes = [recurrente({ id: 5, validFrom: '2026-01-01', validUntil: '2026-03-31' })];

  assert.equal(findConflict(candidata, existentes), null);
});

test('vigencias que se solapan sí generan conflicto', () => {
  const candidata = recurrente({ id: null, validFrom: '2026-03-01' });
  const existentes = [recurrente({ id: 5, validFrom: '2026-01-01', validUntil: '2026-06-30' })];

  assert.equal(findConflict(candidata, existentes)?.id, 5);
});

// --------------- Mensaje ---------------

test('el mensaje nombra la sede, el día y la franja', () => {
  const conflicto = recurrente({ startTime: '08:00', endTime: '12:00' });
  const mensaje = describeConflict('Ana Pérez', conflicto);

  assert.match(mensaje, /Ana Pérez/);
  assert.match(mensaje, /Torre Norte/);
  // La frase no debe concordar con el género de la PERSONA: "asignada" acá
  // concuerda con "la sede", que es femenino, y vale para cualquiera.
  assert.doesNotMatch(mensaje, /est[áa] asignad[oa]/);
  assert.match(mensaje, /martes/);
  assert.match(mensaje, /08:00 a 12:00/);
});

test('el mensaje dice "todo el día" cuando no hay franja', () => {
  assert.match(describeConflict('Ana Pérez', recurrente()), /todo el día/);
});

// --------------- Jornada del empleado ---------------

test('una franja dentro de un bloque de horario es válida', () => {
  const bloques = [{ startTime: '08:00', endTime: '17:00' }];
  assert.equal(dentroDeLaJornada({ startTime: '09:00', endTime: '13:00' }, bloques), true);
});

test('una franja fuera de la jornada no es válida', () => {
  const bloques = [{ startTime: '08:00', endTime: '17:00' }];
  assert.equal(dentroDeLaJornada({ startTime: '18:00', endTime: '20:00' }, bloques), false);
});

test('una franja que se sale por un extremo no es válida', () => {
  const bloques = [{ startTime: '08:00', endTime: '17:00' }];
  assert.equal(dentroDeLaJornada({ startTime: '07:00', endTime: '12:00' }, bloques), false);
});

test('una franja que abarca la pausa de almuerzo es válida', () => {
  // Jornada partida 08-12 y 14-18: la sede de 08:00 a 18:00 es el día entero.
  const bloques = [
    { startTime: '08:00', endTime: '12:00' },
    { startTime: '14:00', endTime: '18:00' },
  ];
  assert.equal(dentroDeLaJornada({ startTime: '08:00', endTime: '18:00' }, bloques), true);
});

test('con jornada partida, salirse del último bloque sigue sin ser válido', () => {
  const bloques = [
    { startTime: '08:00', endTime: '12:00' },
    { startTime: '14:00', endTime: '18:00' },
  ];
  assert.equal(dentroDeLaJornada({ startTime: '08:00', endTime: '19:00' }, bloques), false);
});

test('sin bloques cargados no se bloquea', () => {
  // Un empleado FLEXIBLE puede no tenerlos; impedirlo sería frenar un alta
  // legítima por falta de un dato opcional.
  assert.equal(dentroDeLaJornada({ startTime: '09:00', endTime: '13:00' }, []), true);
});

test('sin horario en la asignación no hay nada que comparar', () => {
  const bloques = [{ startTime: '08:00', endTime: '17:00' }];
  assert.equal(dentroDeLaJornada({ startTime: null, endTime: null }, bloques), true);
});
