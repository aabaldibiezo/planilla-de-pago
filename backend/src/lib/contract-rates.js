/**
 * Selección del monto vigente de un contrato.
 *
 * El monto de un contrato es fijo pero ajustable: cada cambio se guarda como
 * un `ContractRate` nuevo con su fecha de vigencia, y nunca se edita ni se
 * borra el anterior. Esto es lo que permite reconstruir meses después qué se
 * cobraba en marzo, que es justo lo que hace falta en una discusión con el
 * cliente.
 *
 * Módulo puro, sin Prisma: la regla se puede probar sin base de datos.
 *
 * ⚠️ Los montos están en BOLIVIANOS, como los sueldos. No confundir con la
 * suscripción a la plataforma, que está en dólares.
 */

/** Último instante del mes, en UTC. Con mes 1-12, no 0-11. */
const endOfMonth = (month, year) =>
  new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));

/** Normaliza a medianoche UTC para comparar fechas sin que estorbe la hora. */
const atMidnight = (value) => {
  const fecha = new Date(value);
  return new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())
  );
};

/**
 * Monto que rige para un mes dado.
 *
 * Toma el registro con la `validFrom` más alta que no se pase del mes
 * consultado. Un monto que empieza a mitad de mes rige para ese mes completo:
 * el contrato se cobra mensualmente, así que no se prorratea. Un monto con
 * fecha futura no se aplica todavía.
 *
 * Devuelve `null` si el contrato no tiene ningún monto vigente para ese mes,
 * que es distinto de tener monto cero: un contrato recién creado, sin tarifa
 * cargada, no vale 0, simplemente no tiene precio definido.
 *
 * @param {Array<{validFrom: Date|string, amount: number|string}>} rates
 * @param {number} month 1-12
 * @param {number} year
 */
const rateForMonth = (rates, month, year) => {
  if (!Array.isArray(rates) || rates.length === 0) return null;

  const limite = endOfMonth(month, year);

  const vigentes = rates
    .filter((rate) => rate && rate.validFrom != null)
    .filter((rate) => atMidnight(rate.validFrom) <= limite)
    .sort((a, b) => atMidnight(b.validFrom) - atMidnight(a.validFrom));

  return vigentes[0] || null;
};

/**
 * Monto vigente hoy. Atajo para los listados, que muestran el precio actual
 * sin preguntar por un mes concreto.
 */
const currentRate = (rates) => {
  const hoy = new Date();
  return rateForMonth(rates, hoy.getUTCMonth() + 1, hoy.getUTCFullYear());
};

module.exports = { rateForMonth, currentRate, endOfMonth };
