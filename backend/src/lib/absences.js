/**
 * Días con turno y sin ninguna marcación.
 *
 * La nómina paga el sueldo mensual completo y solo resta retrasos y
 * descuentos aprobados. Sin este cálculo, alguien que faltó una semana cobraba
 * lo mismo que quien vino todos los días y nada en la planilla lo mostraba.
 *
 * Esto NO descuenta nada: solo avisa. Un día sin marcar puede ser un feriado,
 * una vacación o un permiso que el sistema no conoce, y descontarlo solo sería
 * un error que pagaría el empleado. El administrador decide, y si corresponde
 * carga una "falta injustificada" desde Horas extra y descuentos.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 */

const soloFecha = (valor) => new Date(valor).toISOString().slice(0, 10);

/**
 * @param {object} p
 * @param {number} p.year
 * @param {number} p.month               1-12
 * @param {Iterable<number>} p.workDays  días de la semana con turno (0 = domingo)
 * @param {Iterable<string|Date>} p.workedDates  fechas con al menos una marcación
 * @param {string|Date} [p.from]         primer día a considerar (alta del empleado)
 * @param {string|Date} p.today          hoy, en hora de Bolivia; no se cuenta
 *                                       porque el día todavía no terminó
 * @returns {string[]} fechas YYYY-MM-DD, en orden
 */
const missingWorkDays = ({ year, month, workDays, workedDates, from = null, today }) => {
  const dias = new Set([...workDays].map(Number));
  if (!dias.size) return [];

  const marcadas = new Set([...workedDates].map(soloFecha));
  const desde = from ? soloFecha(from) : null;
  const hoy = soloFecha(today);
  const ultimoDia = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const faltas = [];
  for (let dia = 1; dia <= ultimoDia; dia += 1) {
    const fecha = new Date(Date.UTC(year, month - 1, dia));
    const iso = fecha.toISOString().slice(0, 10);

    if (iso >= hoy) break;
    if (desde && iso < desde) continue;
    if (!dias.has(fecha.getUTCDay())) continue;
    if (!marcadas.has(iso)) faltas.push(iso);
  }

  return faltas;
};

module.exports = { missingWorkDays };
