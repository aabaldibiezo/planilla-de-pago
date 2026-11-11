/**
 * Geocerco: distancia entre coordenadas y decisión sobre una marcación.
 *
 * Módulo puro, sin Prisma: toda la decisión ocurre en el servidor y se puede
 * probar sin base de datos.
 *
 * IMPORTANTE: las coordenadas y el radio de las sedes NUNCA deben viajar al
 * teléfono. Si viajaran, cualquiera con las herramientas de desarrollo sabría
 * exactamente dónde pararse para que la marcación salga válida.
 */

const EARTH_RADIUS_METERS = 6371008.8;

/** Margen extra tolerado por la imprecisión declarada del GPS. */
const MAX_ACCURACY_ALLOWANCE_METERS = 100;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

const isValidCoordinate = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180 &&
  // (0,0) es el "null island": casi siempre indica un GPS sin fijar posición.
  !(latitude === 0 && longitude === 0);

/**
 * Distancia en metros sobre la superficie terrestre (fórmula de Haversine).
 */
const distanceMeters = (fromLat, fromLon, toLat, toLon) => {
  const latFrom = toRadians(Number(fromLat));
  const latTo = toRadians(Number(toLat));
  const deltaLat = toRadians(Number(toLat) - Number(fromLat));
  const deltaLon = toRadians(Number(toLon) - Number(fromLon));

  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(latFrom) * Math.cos(latTo) * Math.sin(deltaLon / 2) ** 2;

  return Math.round(EARTH_RADIUS_METERS * 2 * Math.asin(Math.min(1, Math.sqrt(a))));
};

/**
 * Evalúa una marcación contra las sedes asignadas al empleado ese día.
 *
 * Con varias sedes asignadas (rotación), se acepta si cae dentro del radio de
 * cualquiera de ellas y se reporta la más cercana.
 *
 * Devuelve siempre un resultado; nunca lanza ni bloquea. Una marcación
 * sospechosa se registra igual y queda para revisión del administrador.
 */
const evaluateLocation = ({ latitude, longitude, accuracyMeters, worksites }) => {
  if (!Array.isArray(worksites) || worksites.length === 0) {
    return {
      status: 'NOT_REQUIRED',
      distanceMeters: null,
      worksiteId: null,
      reason: 'El empleado no tiene sede asignada para este momento',
    };
  }

  const lat = Number(latitude);
  const lon = Number(longitude);

  if (!isValidCoordinate(lat, lon)) {
    return {
      status: 'UNAVAILABLE',
      distanceMeters: null,
      worksiteId: null,
      reason: 'El dispositivo no entregó una ubicación válida',
    };
  }

  const medidas = worksites
    .map((worksite) => ({
      worksite,
      distance: distanceMeters(lat, lon, worksite.latitude, worksite.longitude),
    }))
    .sort((a, b) => a.distance - b.distance);

  const cercana = medidas[0];

  // La imprecisión del GPS amplía el radio tolerado, pero con tope: una
  // precisión declarada de 5 km no puede justificar cualquier ubicación.
  const allowance = Math.min(
    Math.max(0, Number(accuracyMeters) || 0),
    MAX_ACCURACY_ALLOWANCE_METERS
  );

  const dentro = medidas.some(
    ({ worksite, distance }) => distance <= Number(worksite.radiusMeters) + allowance
  );

  return {
    status: dentro ? 'OK' : 'SUSPICIOUS',
    distanceMeters: cercana.distance,
    worksiteId: cercana.worksite.id,
    reason: dentro
      ? null
      : `A ${cercana.distance} m de ${cercana.worksite.name} (radio ${cercana.worksite.radiusMeters} m)`,
  };
};

/**
 * Selecciona las sedes asignadas a un empleado para una fecha dada.
 *
 * Una asignación puntual (`specificDate`) tiene prioridad sobre la recurrente:
 * si a alguien lo mandan un día a otro lado, ese día se valida contra esa sede
 * y no contra la habitual.
 */
const worksitesForDate = (assignments, date) => {
  const target = new Date(date);
  const iso = target.toISOString().slice(0, 10);
  const dayOfWeek = target.getUTCDay();

  const vigente = (assignment) => {
    if (assignment.isActive === false) return false;
    if (assignment.validFrom && iso < new Date(assignment.validFrom).toISOString().slice(0, 10)) {
      return false;
    }
    if (assignment.validUntil && iso > new Date(assignment.validUntil).toISOString().slice(0, 10)) {
      return false;
    }
    return true;
  };

  const puntuales = assignments.filter(
    (assignment) =>
      vigente(assignment) &&
      assignment.specificDate &&
      new Date(assignment.specificDate).toISOString().slice(0, 10) === iso
  );

  if (puntuales.length > 0) return puntuales.map((assignment) => assignment.worksite);

  return assignments
    .filter(
      (assignment) =>
        vigente(assignment) && assignment.specificDate == null && assignment.dayOfWeek === dayOfWeek
    )
    .map((assignment) => assignment.worksite);
};

module.exports = {
  distanceMeters,
  evaluateLocation,
  worksitesForDate,
  isValidCoordinate,
  EARTH_RADIUS_METERS,
  MAX_ACCURACY_ALLOWANCE_METERS,
};
