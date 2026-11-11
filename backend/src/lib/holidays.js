/**
 * Feriados y días extra (domingos o feriados trabajados fuera de contrato).
 *
 * Cómo paga el cliente:
 *   - El sueldo es fijo por mes según el contrato. Si el horario de la persona
 *     incluye el domingo, trabajarlo es parte del contrato y no se paga aparte.
 *   - Si se la llama un día que NO es de su turno (un domingo de descanso) o un
 *     feriado, ese día se paga como extra a fin de mes.
 *   - Un feriado no trabajado no es una falta.
 *
 * Los feriados nacionales se CALCULAN, no se cargan: así no hay que acordarse
 * de actualizar una tabla cada año, y Carnaval, Viernes Santo y Corpus Christi
 * —que dependen de la Pascua— caen solos en su fecha. Cada empresa agrega los
 * que le faltan (departamentales, decretados) desde el panel.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 */

const iso = (fecha) => fecha.toISOString().slice(0, 10);
const utc = (year, month, day) => new Date(Date.UTC(year, month - 1, day));
const masDias = (fecha, dias) => new Date(fecha.getTime() + dias * 86400000);

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
const pascua = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, mes, dia);
};

/** Feriados nacionales de Bolivia de un año, como [{ date: 'YYYY-MM-DD', name }]. */
const nationalHolidays = (year) => {
  const domingoDePascua = pascua(year);
  return [
    { date: iso(utc(year, 1, 1)), name: 'Año Nuevo' },
    { date: iso(utc(year, 1, 22)), name: 'Día del Estado Plurinacional' },
    { date: iso(masDias(domingoDePascua, -48)), name: 'Carnaval (lunes)' },
    { date: iso(masDias(domingoDePascua, -47)), name: 'Carnaval (martes)' },
    { date: iso(masDias(domingoDePascua, -2)), name: 'Viernes Santo' },
    { date: iso(utc(year, 5, 1)), name: 'Día del Trabajo' },
    { date: iso(masDias(domingoDePascua, 60)), name: 'Corpus Christi' },
    { date: iso(utc(year, 6, 21)), name: 'Año Nuevo Andino Amazónico' },
    { date: iso(utc(year, 8, 6)), name: 'Día de la Independencia' },
    { date: iso(utc(year, 11, 2)), name: 'Todos Santos' },
    { date: iso(utc(year, 12, 25)), name: 'Navidad' },
  ].sort((x, y) => x.date.localeCompare(y.date));
};

/**
 * Feriados que rigen en un mes: los nacionales más los de la empresa.
 *
 * @param {Array<{date: string|Date, name: string}>} propios  feriados de la empresa
 * @returns {Map<string, string>} fecha YYYY-MM-DD → nombre
 */
const holidaysForMonth = (year, month, propios = []) => {
  const prefijo = `${year}-${String(month).padStart(2, '0')}-`;
  const mapa = new Map();
  nationalHolidays(year)
    .filter((f) => f.date.startsWith(prefijo))
    .forEach((f) => mapa.set(f.date, f.name));
  propios
    .map((f) => ({ date: iso(new Date(f.date)), name: f.name }))
    .filter((f) => f.date.startsWith(prefijo))
    .forEach((f) => mapa.set(f.date, f.name));
  return mapa;
};

/**
 * Días trabajados que se pagan como extra.
 *
 * Un día cuenta como extra si es feriado, o si la persona tiene horario
 * cargado y ese día de la semana no está en él. Sin horario cargado solo el
 * domingo se considera fuera de turno.
 *
 * @param {object} p
 * @param {Iterable<string|Date>} p.workedDates  fechas con marcación
 * @param {Iterable<number>} p.workDays          días de turno (0 = domingo)
 * @param {Map<string, string>} p.holidays       de `holidaysForMonth`
 * @returns {Array<{date: string, reason: string}>}
 */
const extraWorkDays = ({ workedDates, workDays, holidays }) => {
  const dias = new Set([...workDays].map(Number));
  const fueraDeTurno = (diaSemana) => (dias.size ? !dias.has(diaSemana) : diaSemana === 0);

  return [...new Set([...workedDates].map((f) => iso(new Date(f))))]
    .sort()
    .flatMap((fecha) => {
      if (holidays.has(fecha)) return [{ date: fecha, reason: `Feriado: ${holidays.get(fecha)}` }];
      const diaSemana = new Date(`${fecha}T00:00:00.000Z`).getUTCDay();
      if (fueraDeTurno(diaSemana)) {
        return [{ date: fecha, reason: diaSemana === 0 ? 'Domingo' : 'Día fuera de turno' }];
      }
      return [];
    });
};

/**
 * Monto de un día extra: un jornal (sueldo ÷ 30) por el factor de la empresa.
 * El factor por defecto es 2 (pago doble).
 */
const extraDayAmount = (monthlySalary, factor = 2) =>
  Number(((Number(monthlySalary) / 30) * Number(factor)).toFixed(2));

module.exports = { pascua, nationalHolidays, holidaysForMonth, extraWorkDays, extraDayAmount };
