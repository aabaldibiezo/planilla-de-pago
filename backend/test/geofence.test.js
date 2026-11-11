const test = require('node:test');
const assert = require('node:assert/strict');

const { distanceMeters, evaluateLocation, worksitesForDate } = require('../src/lib/geofence');

// Coordenadas reales de Cochabamba, Bolivia.
const PLAZA_14_SEPTIEMBRE = { lat: -17.393835, lon: -66.156872 };
const CRISTO_DE_LA_CONCORDIA = { lat: -17.377499, lon: -66.13639 };
const LA_PAZ = { lat: -16.489689, lon: -68.119293 };

const sede = (overrides = {}) => ({
  id: 1,
  name: 'Oficina Central',
  latitude: PLAZA_14_SEPTIEMBRE.lat,
  longitude: PLAZA_14_SEPTIEMBRE.lon,
  radiusMeters: 150,
  ...overrides,
});

// --------------- Distancia ---------------

test('la distancia de un punto a sí mismo es cero', () => {
  const { lat, lon } = PLAZA_14_SEPTIEMBRE;
  assert.equal(distanceMeters(lat, lon, lat, lon), 0);
});

test('calcula distancias cortas dentro de la ciudad', () => {
  // Plaza principal al Cristo de la Concordia: ~2,8 km en línea recta.
  const metros = distanceMeters(
    PLAZA_14_SEPTIEMBRE.lat,
    PLAZA_14_SEPTIEMBRE.lon,
    CRISTO_DE_LA_CONCORDIA.lat,
    CRISTO_DE_LA_CONCORDIA.lon
  );
  assert.ok(metros > 2600 && metros < 3100, `Se obtuvo ${metros} m`);
});

test('calcula distancias largas entre ciudades', () => {
  // Cochabamba a La Paz: ~232 km en línea recta (no confundir con los ~380 km
  // por carretera). Verificado aparte con una aproximación equirectangular.
  const metros = distanceMeters(
    PLAZA_14_SEPTIEMBRE.lat,
    PLAZA_14_SEPTIEMBRE.lon,
    LA_PAZ.lat,
    LA_PAZ.lon
  );
  assert.ok(metros > 228000 && metros < 236000, `Se obtuvo ${metros} m`);
});

test('la distancia es simétrica', () => {
  const ida = distanceMeters(-17.39, -66.15, -17.38, -66.13);
  const vuelta = distanceMeters(-17.38, -66.13, -17.39, -66.15);
  assert.equal(ida, vuelta);
});

// --------------- Evaluación de la marcación ---------------

test('acepta una marcación dentro del radio', () => {
  const resultado = evaluateLocation({
    latitude: PLAZA_14_SEPTIEMBRE.lat,
    longitude: PLAZA_14_SEPTIEMBRE.lon,
    accuracyMeters: 10,
    worksites: [sede()],
  });
  assert.equal(resultado.status, 'OK');
  assert.equal(resultado.worksiteId, 1);
  assert.equal(resultado.reason, null);
});

test('marca como sospechosa una marcación lejana', () => {
  const resultado = evaluateLocation({
    latitude: CRISTO_DE_LA_CONCORDIA.lat,
    longitude: CRISTO_DE_LA_CONCORDIA.lon,
    accuracyMeters: 10,
    worksites: [sede()],
  });
  assert.equal(resultado.status, 'SUSPICIOUS');
  assert.ok(resultado.distanceMeters > 2000);
  assert.match(resultado.reason, /Oficina Central/);
});

test('la imprecisión del GPS amplía el radio tolerado', () => {
  // ~200 m de la sede: fuera del radio de 150 m, pero con 80 m de imprecisión
  // declarada el margen alcanza y no debe marcarse como sospechosa.
  const puntoCercano = { lat: -17.395635, lon: -66.156872 };

  const sinMargen = evaluateLocation({
    latitude: puntoCercano.lat,
    longitude: puntoCercano.lon,
    accuracyMeters: 5,
    worksites: [sede()],
  });
  assert.equal(sinMargen.status, 'SUSPICIOUS');

  const conMargen = evaluateLocation({
    latitude: puntoCercano.lat,
    longitude: puntoCercano.lon,
    accuracyMeters: 80,
    worksites: [sede()],
  });
  assert.equal(conMargen.status, 'OK');
});

test('una imprecisión absurda no justifica cualquier ubicación', () => {
  // Declarar 50 km de imprecisión no puede validar una marcación en otra ciudad.
  const resultado = evaluateLocation({
    latitude: LA_PAZ.lat,
    longitude: LA_PAZ.lon,
    accuracyMeters: 50000,
    worksites: [sede()],
  });
  assert.equal(resultado.status, 'SUSPICIOUS');
});

test('con sedes rotativas acepta si cae en cualquiera de las asignadas', () => {
  const worksites = [
    sede({ id: 1, name: 'Oficina Central' }),
    sede({
      id: 2,
      name: 'Condominio Norte',
      latitude: CRISTO_DE_LA_CONCORDIA.lat,
      longitude: CRISTO_DE_LA_CONCORDIA.lon,
    }),
  ];

  const resultado = evaluateLocation({
    latitude: CRISTO_DE_LA_CONCORDIA.lat,
    longitude: CRISTO_DE_LA_CONCORDIA.lon,
    accuracyMeters: 10,
    worksites,
  });

  assert.equal(resultado.status, 'OK');
  assert.equal(resultado.worksiteId, 2, 'debe reportar la sede más cercana');
});

test('el radio se respeta por sede', () => {
  // Un predio grande tolera más que una oficina.
  const puntoCercano = { lat: -17.395635, lon: -66.156872 };

  const oficina = evaluateLocation({
    latitude: puntoCercano.lat,
    longitude: puntoCercano.lon,
    accuracyMeters: 0,
    worksites: [sede({ radiusMeters: 150 })],
  });
  assert.equal(oficina.status, 'SUSPICIOUS');

  const predio = evaluateLocation({
    latitude: puntoCercano.lat,
    longitude: puntoCercano.lon,
    accuracyMeters: 0,
    worksites: [sede({ radiusMeters: 400 })],
  });
  assert.equal(predio.status, 'OK');
});

// --------------- Casos sin ubicación utilizable ---------------

test('distingue GPS no disponible de ubicación sospechosa', () => {
  const sinDatos = evaluateLocation({
    latitude: null,
    longitude: null,
    accuracyMeters: null,
    worksites: [sede()],
  });
  assert.equal(sinDatos.status, 'UNAVAILABLE');

  // (0,0) es el "null island": GPS que nunca fijó posición.
  const nullIsland = evaluateLocation({
    latitude: 0,
    longitude: 0,
    accuracyMeters: 10,
    worksites: [sede()],
  });
  assert.equal(nullIsland.status, 'UNAVAILABLE');

  const fueraDeRango = evaluateLocation({
    latitude: 95,
    longitude: -66,
    accuracyMeters: 10,
    worksites: [sede()],
  });
  assert.equal(fueraDeRango.status, 'UNAVAILABLE');
});

test('sin sede asignada no se exige ubicación', () => {
  const resultado = evaluateLocation({
    latitude: PLAZA_14_SEPTIEMBRE.lat,
    longitude: PLAZA_14_SEPTIEMBRE.lon,
    accuracyMeters: 10,
    worksites: [],
  });
  assert.equal(resultado.status, 'NOT_REQUIRED');
});

// --------------- Selección de sede por fecha (rotación) ---------------

const asignacion = (overrides = {}) => ({
  isActive: true,
  validFrom: '2026-01-01',
  validUntil: null,
  dayOfWeek: null,
  specificDate: null,
  worksite: sede(),
  ...overrides,
});

test('elige la sede recurrente del día de la semana', () => {
  // 2026-07-27 es lunes (dayOfWeek 1).
  const asignaciones = [
    asignacion({ dayOfWeek: 1, worksite: sede({ id: 10, name: 'Lunes' }) }),
    asignacion({ dayOfWeek: 2, worksite: sede({ id: 20, name: 'Martes' }) }),
  ];

  const sedes = worksitesForDate(asignaciones, '2026-07-27');
  assert.equal(sedes.length, 1);
  assert.equal(sedes[0].id, 10);
});

test('una asignación puntual tiene prioridad sobre la recurrente', () => {
  const asignaciones = [
    asignacion({ dayOfWeek: 1, worksite: sede({ id: 10, name: 'Habitual' }) }),
    asignacion({ specificDate: '2026-07-27', worksite: sede({ id: 99, name: 'Refuerzo' }) }),
  ];

  const sedes = worksitesForDate(asignaciones, '2026-07-27');
  assert.equal(sedes.length, 1);
  assert.equal(sedes[0].id, 99);
});

test('ignora asignaciones vencidas o aún no vigentes', () => {
  const vencida = asignacion({
    dayOfWeek: 1,
    validUntil: '2026-06-30',
    worksite: sede({ id: 10 }),
  });
  assert.equal(worksitesForDate([vencida], '2026-07-27').length, 0);

  const futura = asignacion({
    dayOfWeek: 1,
    validFrom: '2026-12-01',
    worksite: sede({ id: 11 }),
  });
  assert.equal(worksitesForDate([futura], '2026-07-27').length, 0);

  const inactiva = asignacion({ dayOfWeek: 1, isActive: false, worksite: sede({ id: 12 }) });
  assert.equal(worksitesForDate([inactiva], '2026-07-27').length, 0);
});

test('un empleado puede cubrir dos sedes el mismo día', () => {
  const asignaciones = [
    asignacion({ dayOfWeek: 1, startTime: '08:00', endTime: '12:00', worksite: sede({ id: 10 }) }),
    asignacion({ dayOfWeek: 1, startTime: '14:00', endTime: '18:00', worksite: sede({ id: 20 }) }),
  ];

  const sedes = worksitesForDate(asignaciones, '2026-07-27');
  assert.equal(sedes.length, 2);
});
