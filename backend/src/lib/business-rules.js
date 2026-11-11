/**
 * Reglas de negocio puras: horarios, duraciones y montos.
 *
 * Este módulo no importa Prisma ni ningún recurso externo a propósito. Es la
 * única fuente de verdad de estos cálculos y permite probarlos sin base de datos.
 */

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_PER_DAY = 1440;

/** Zona horaria de operación. Bolivia es UTC-4 fijo, sin horario de verano. */
const TIMEZONE = 'America/La_Paz';

/**
 * Fecha (YYYY-MM-DD) y hora (HH:MM) actuales en Bolivia.
 *
 * No se puede usar `toISOString()` para esto: devuelve UTC, y entre las 20:00
 * y la medianoche de Bolivia eso ya es el día siguiente. Confundirlos hacía
 * que una asignación de sede creada de noche quedara vigente recién al otro día.
 */
const boliviaNow = () => {
  const partes = {};
  new Intl.DateTimeFormat('es-BO', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(new Date())
    .forEach((parte) => {
      partes[parte.type] = parte.value;
    });

  return {
    dateStr: `${partes.year}-${partes.month}-${partes.day}`,
    timeStr: `${partes.hour}:${partes.minute}`,
  };
};

/** Fecha de hoy en Bolivia, normalizada a medianoche UTC para guardar en `@db.Date`. */
const boliviaToday = () => new Date(`${boliviaNow().dateStr}T00:00:00.000Z`);

/** Convierte "HH:MM" a minutos desde la medianoche. */
const minutes = (value) => {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
};

/** Normaliza un valor de fecha a medianoche UTC, descartando la hora. */
const dateOnly = (value) =>
  value instanceof Date
    ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
    : new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);

/**
 * Valida y normaliza los bloques de horario de un empleado.
 * Detecta días inválidos, formatos incorrectos y solapamientos dentro del mismo día.
 */
const validateBlocks = (blocks) => {
  if (!Array.isArray(blocks) || !blocks.length) {
    throw new Error('Debe registrar al menos un bloque de horario');
  }

  const normalized = blocks.map((block, index) => {
    if (!Number.isInteger(Number(block.dayOfWeek)) || block.dayOfWeek < 0 || block.dayOfWeek > 6) {
      throw new Error('El día del horario no es válido');
    }
    if (!TIME_PATTERN.test(block.startTime) || !TIME_PATTERN.test(block.endTime)) {
      throw new Error('Las horas deben usar el formato HH:MM');
    }
    if (block.startTime === block.endTime) {
      throw new Error('La entrada y salida no pueden ser iguales');
    }

    return {
      dayOfWeek: Number(block.dayOfWeek),
      startTime: block.startTime,
      endTime: block.endTime,
      blockOrder: index + 1,
      crossesMidnight: minutes(block.endTime) < minutes(block.startTime),
      isActive: block.isActive !== false,
    };
  });

  const days = [...new Set(normalized.map((block) => block.dayOfWeek))];
  for (const day of days) {
    const ranges = normalized
      .filter((block) => block.dayOfWeek === day)
      .map((block) => ({
        start: minutes(block.startTime),
        end: minutes(block.endTime) + (block.crossesMidnight ? MINUTES_PER_DAY : 0),
      }))
      .sort((a, b) => a.start - b.start);

    for (let i = 1; i < ranges.length; i += 1) {
      if (ranges[i].start < ranges[i - 1].end) {
        throw new Error('Existen bloques de horario solapados en el mismo día');
      }
    }
  }

  return normalized;
};

/** Duración en horas entre dos "HH:MM", contemplando el cruce de medianoche. */
const durationHours = (start, end) => {
  if (start === end) {
    throw new Error('La hora de inicio y fin no pueden ser iguales');
  }

  let diff = minutes(end) - minutes(start);
  if (diff < 0) diff += MINUTES_PER_DAY;

  return Number((diff / 60).toFixed(2));
};

/** Intervalo [inicio, fin) en minutos; el fin se proyecta al día siguiente si corresponde. */
const interval = (start, end) => {
  const startMinutes = minutes(start);
  let endMinutes = minutes(end);
  if (endMinutes <= startMinutes) endMinutes += MINUTES_PER_DAY;
  return [startMinutes, endMinutes];
};

/** Indica si dos intervalos se solapan. */
const overlaps = (left, right) => left[0] < right[1] && right[0] < left[1];

/**
 * Calcula el monto de una hora extra según su modalidad de pago.
 * Valida que el multiplicador sea coherente con la modalidad elegida.
 */
const overtimeAmount = (user, input, hours) => {
  const rate = Number(user.hourlyRate);
  const multiplier = Number(input.multiplier ?? 1);

  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error('El multiplicador debe ser mayor a cero');
  }
  if (input.paymentMode === 'LOWER_RATE' && multiplier >= 1) {
    throw new Error('La tarifa reducida requiere un multiplicador menor a 1');
  }
  if (input.paymentMode === 'HIGHER_RATE' && multiplier <= 1) {
    throw new Error('La tarifa incrementada requiere un multiplicador mayor a 1');
  }
  if (input.paymentMode === 'SAME_RATE' && multiplier !== 1) {
    throw new Error('La tarifa normal debe usar multiplicador 1');
  }

  if (input.paymentMode === 'FIXED_AMOUNT') {
    const fixed = Number(input.fixedAmount);
    if (!Number.isFinite(fixed) || fixed <= 0) {
      throw new Error('El monto fijo debe ser mayor a cero');
    }
    return fixed;
  }

  if (['TIME_OFF', 'UNPAID'].includes(input.paymentMode)) return 0;

  return Number((hours * rate * multiplier).toFixed(2));
};

/** Minutos de retraso; una llegada anticipada no genera retraso negativo. */
const calculateDelayMinutes = (scheduled, actual) =>
  Math.max(0, minutes(actual) - minutes(scheduled));

/** Horas trabajadas entre dos "HH:MM", contemplando turnos que cruzan medianoche. */
const calculateWorkedHours = (actualEntry, actualExit) => {
  let diff = minutes(actualExit) - minutes(actualEntry);
  if (diff < 0) diff += MINUTES_PER_DAY;
  return Number((diff / 60).toFixed(2));
};

module.exports = {
  TIME_PATTERN,
  MINUTES_PER_DAY,
  TIMEZONE,
  boliviaNow,
  boliviaToday,
  minutes,
  dateOnly,
  validateBlocks,
  durationHours,
  interval,
  overlaps,
  overtimeAmount,
  calculateDelayMinutes,
  calculateWorkedHours,
};
