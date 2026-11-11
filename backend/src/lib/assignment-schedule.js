/**
 * Cruce de horarios entre asignaciones de sede.
 *
 * Un empleado puede rotar entre sedes el mismo día, pero no puede estar en dos
 * lugares a la vez. Sin esta comprobación, el sistema aceptaba asignar a la
 * misma persona a tres sedes el mismo día sin decir nada.
 *
 * Módulo puro, sin Prisma: la regla se puede probar sin base de datos.
 */

const { interval, overlaps } = require('./business-rules');

const MINUTOS_DEL_DIA = 24 * 60;

/** Una asignación sin horario ocupa el día entero. */
const DIA_COMPLETO = [0, MINUTOS_DEL_DIA];

/**
 * Franja que ocupa una asignación.
 *
 * Las asignaciones existentes no tienen horario cargado —el formulario nunca
 * lo pidió—, así que se interpretan como jornada completa. Es la lectura
 * conservadora: se avisa de más, no de menos.
 */
const ventana = (asignacion) =>
  asignacion.startTime && asignacion.endTime
    ? interval(asignacion.startTime, asignacion.endTime)
    : DIA_COMPLETO;

const soloFecha = (valor) => (valor ? new Date(valor).toISOString().slice(0, 10) : null);

/**
 * ¿Dos asignaciones caen en el mismo día?
 *
 * Una asignación puntual (`specificDate`) NO choca con una recurrente, aunque
 * la fecha caiga en ese día de la semana: `worksitesForDate` en `geofence.js`
 * le da prioridad a la puntual y descarta las recurrentes de esa fecha. Si acá
 * se marcara conflicto, la validación diría una cosa y el geocerco haría otra.
 */
const mismoDia = (candidata, existente) => {
  const fechaCandidata = soloFecha(candidata.specificDate);
  const fechaExistente = soloFecha(existente.specificDate);

  // Ambas puntuales: chocan solo si son exactamente el mismo día.
  if (fechaCandidata && fechaExistente) return fechaCandidata === fechaExistente;

  // Una puntual y una recurrente: la puntual manda ese día, no hay conflicto.
  if (fechaCandidata || fechaExistente) return false;

  // Ambas recurrentes: mismo día de la semana.
  return (
    candidata.dayOfWeek != null &&
    existente.dayOfWeek != null &&
    Number(candidata.dayOfWeek) === Number(existente.dayOfWeek)
  );
};

/**
 * ¿Los períodos de vigencia de dos asignaciones se superponen?
 *
 * Dos asignaciones al mismo día de la semana no chocan si uno terminó antes de
 * que el otro empezara: alguien pudo estar en una sede hasta marzo y en otra
 * desde abril, los dos martes, sin solaparse nunca.
 */
const vigenciasSeCruzan = (candidata, existente) => {
  const desdeA = soloFecha(candidata.validFrom) || '0000-01-01';
  const hastaA = soloFecha(candidata.validUntil) || '9999-12-31';
  const desdeB = soloFecha(existente.validFrom) || '0000-01-01';
  const hastaB = soloFecha(existente.validUntil) || '9999-12-31';

  return desdeA <= hastaB && desdeB <= hastaA;
};

/**
 * Busca la primera asignación existente que choque con la candidata.
 *
 * Devuelve la asignación en conflicto, o `null` si no hay ninguna. No lanza:
 * quien llama decide si eso es un error o solo un aviso.
 *
 * Dos franjas que se tocan en el borde NO chocan: 08:00-12:00 y 12:00-16:00
 * son un turno encadenado, no un solapamiento. Eso ya lo resuelve `overlaps`,
 * que compara con desigualdad estricta.
 */
const findConflict = (candidata, existentes = []) => {
  const franjaCandidata = ventana(candidata);

  return (
    existentes.find((existente) => {
      if (existente.isActive === false) return false;
      if (candidata.id != null && existente.id === candidata.id) return false;
      if (!mismoDia(candidata, existente)) return false;
      if (!vigenciasSeCruzan(candidata, existente)) return false;

      return overlaps(franjaCandidata, ventana(existente));
    }) || null
  );
};

const DIAS = [
  'domingos',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábados',
];

/**
 * Mensaje para el administrador. Nombra la sede que ya ocupa la franja: sin
 * eso, el aviso obliga a revisar las asignaciones una por una para entender
 * qué pasó.
 */
const describeConflict = (empleado, conflicto) => {
  const cuando = conflicto.specificDate
    ? `el ${soloFecha(conflicto.specificDate)}`
    : `los ${DIAS[Number(conflicto.dayOfWeek)] || 'mismos días'}`;

  const franja =
    conflicto.startTime && conflicto.endTime
      ? `de ${conflicto.startTime} a ${conflicto.endTime}`
      : 'todo el día';

  const sede = conflicto.worksite?.name || 'otra sede';

  // Redactado sin concordancia de género: el sistema no guarda el género de
  // la persona y "asignado/a" obligaría a inventarlo.
  return (
    `${empleado} ya tiene asignada la sede ${sede} ${cuando} ${franja}. ` +
    'Elija otro horario o libere esa asignación.'
  );
};

/**
 * ¿La franja cae dentro de la jornada del empleado ese día?
 *
 * Evita asignar a alguien a una sede en un horario en el que no trabaja. Es
 * acá donde `ScheduleBlock` cumple su papel: define las horas del empleado,
 * no las de la sede.
 *
 * Sin bloques cargados devuelve `true`: un empleado FLEXIBLE puede no tenerlos
 * y bloquearlo sería impedir una asignación legítima.
 *
 * Se compara contra la jornada completa del día (del primer ingreso a la
 * última salida), no contra cada bloque por separado. Una jornada 08-12 y
 * 14-18 tiene una pausa de almuerzo en medio, y la sede de 08:00 a 18:00 es
 * justamente donde pasa ese día: exigir que quepa en un solo bloque rechazaba
 * el caso más común sin que el administrador entendiera por qué.
 */
const dentroDeLaJornada = (candidata, bloques = []) => {
  if (!candidata.startTime || !candidata.endTime) return true;
  if (!bloques.length) return true;

  const franja = interval(candidata.startTime, candidata.endTime);
  const intervalos = bloques.map((bloque) => interval(bloque.startTime, bloque.endTime));
  const inicio = Math.min(...intervalos.map(([desde]) => desde));
  const fin = Math.max(...intervalos.map(([, hasta]) => hasta));

  return franja[0] >= inicio && franja[1] <= fin;
};

module.exports = {
  findConflict,
  describeConflict,
  dentroDeLaJornada,
  ventana,
  mismoDia,
  vigenciasSeCruzan,
  DIA_COMPLETO,
};
