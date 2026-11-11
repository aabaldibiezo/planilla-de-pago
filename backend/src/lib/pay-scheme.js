/**
 * Cómo cobra cada tipo de empleado.
 *
 *   FIJO      sueldo mensual fijo por contrato, trabaje los días que trabaje.
 *   TEMPORAL  cobra por día: los días que marcó en el mes × su pago por día.
 *
 * Esta es la única pieza que distingue los dos esquemas; la nómina, el valor
 * de la hora y los días extra la consultan en vez de repetir el `if`.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 */

/** Jornada legal en Bolivia: 8 horas. Un jornal = 8 horas. */
const HORAS_POR_JORNAL = 8;

const round2 = (n) => Number(Number(n).toFixed(2));
const soloFecha = (valor) => new Date(valor).toISOString().slice(0, 10);

const isDaily = (employeeType) => employeeType === 'TEMPORAL';

/** Valor de un jornal: el pago por día del temporal, o sueldo ÷ 30 del fijo. */
const dailyRateFor = ({ employeeType, monthlySalary, dailyWage }) =>
  isDaily(employeeType) ? round2(dailyWage || 0) : round2(Number(monthlySalary || 0) / 30);

/**
 * Valor de la hora, para descontar retrasos y pagar horas extra.
 * Fijo: sueldo ÷ horas del mes. Temporal: pago por día ÷ 8.
 */
const hourlyRateFor = ({ employeeType, monthlySalary, monthlyHours, dailyWage }) => {
  if (isDaily(employeeType)) return round2(Number(dailyWage || 0) / HORAS_POR_JORNAL);
  const horas = Number(monthlyHours || 0);
  return horas > 0 ? round2(Number(monthlySalary || 0) / horas) : 0;
};

/**
 * Lo que se gana en el mes antes de extras y descuentos.
 *
 * @returns {{ amount: number, daysWorked: number|null, dailyRate: number|null }}
 *   `daysWorked` y `dailyRate` solo para el temporal.
 */
const basePayFor = (user, workedDates = []) => {
  if (!isDaily(user.employeeType)) {
    return { amount: round2(user.monthlySalary || 0), daysWorked: null, dailyRate: null };
  }
  const dias = new Set([...workedDates].map(soloFecha)).size;
  const jornal = dailyRateFor(user);
  return { amount: round2(dias * jornal), daysWorked: dias, dailyRate: jornal };
};

/**
 * Lo que se suma por cada domingo de descanso o feriado trabajado.
 *
 * Fijo: el sueldo del mes no cubre ese día, así que se paga entero por el
 * factor (2 = doble). Temporal: el día ya se pagó como trabajado, así que solo
 * se suma la diferencia para que el total del día quede en jornal × factor.
 */
const extraDayRateFor = (user, factor = 2) => {
  const jornal = dailyRateFor(user);
  return isDaily(user.employeeType)
    ? round2(jornal * Math.max(0, Number(factor) - 1))
    : round2(jornal * Number(factor));
};

module.exports = {
  HORAS_POR_JORNAL,
  isDaily,
  dailyRateFor,
  hourlyRateFor,
  basePayFor,
  extraDayRateFor,
};
