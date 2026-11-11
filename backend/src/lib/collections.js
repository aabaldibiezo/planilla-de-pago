/**
 * Cobros a clientes: qué mes de cada contrato hay que cobrar y cuándo.
 *
 *   ANTICIPADO  el mes M se cobra el día de cobro del mismo mes M.
 *   POSTERIOR   el mes M se cobra el día de cobro del mes siguiente.
 *
 * Un mes queda pendiente hasta que se registra su cobro. El recordatorio
 * aparece unos días antes del vencimiento y no se va hasta que se cobra.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 * Montos en BOLIVIANOS, como los contratos.
 */

const { rateForMonth } = require('./contract-rates');

/** Días antes del vencimiento en que empieza a avisar. */
const DIAS_DE_AVISO = 3;
/** Meses hacia atrás que se revisan: lo más viejo ya debería estar resuelto. */
const MESES_HACIA_ATRAS = 6;

const DIA_MS = 24 * 60 * 60 * 1000;
const soloFecha = (valor) => {
  const f = new Date(valor);
  return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()));
};
const iso = (fecha) => fecha.toISOString().slice(0, 10);

/** Día del mes, recortado al último si el mes es más corto (31 en febrero → 28). */
const diaEnMes = (year, month, dia) => {
  const ultimo = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(Math.max(1, dia), ultimo)));
};

/** Fecha en que vence el cobro del mes M de un contrato. */
const dueDateFor = ({ paymentTerms, billingDay }, month, year) => {
  const dia = Number(billingDay) || 5;
  if (paymentTerms === 'POSTERIOR') {
    const siguiente = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
    return diaEnMes(siguiente.year, siguiente.month, dia);
  }
  return diaEnMes(year, month, dia);
};

/** Meses (año, mes) entre dos fechas, ambos extremos incluidos. */
const mesesEntre = (desde, hasta) => {
  const lista = [];
  let y = desde.getUTCFullYear();
  let m = desde.getUTCMonth() + 1;
  const yFin = hasta.getUTCFullYear();
  const mFin = hasta.getUTCMonth() + 1;
  while (y < yFin || (y === yFin && m <= mFin)) {
    lista.push({ year: y, month: m });
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
  return lista;
};

/**
 * Cobros pendientes que ya corresponde recordar.
 *
 * @param {Array} contracts  con `rates`, `collections` ({month, year}),
 *                           `paymentTerms`, `billingDay`, `startDate`,
 *                           `endDate`, `isActive` y `client`.
 * @param {Date|string} today  hoy, en hora de Bolivia
 * @returns {Array<{contractId, month, year, amount, dueDate, daysLate, overdue}>}
 *   ordenados por vencimiento, el más atrasado primero.
 */
const pendingCollections = (contracts, today, opciones = {}) => {
  const aviso = opciones.diasDeAviso ?? DIAS_DE_AVISO;
  const atras = opciones.mesesHaciaAtras ?? MESES_HACIA_ATRAS;
  const hoy = soloFecha(today);
  const inicioRevision = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - atras, 1)
  );
  // Un mes posterior al actual nunca vence dentro del margen de aviso.
  const finRevision = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1));

  const pendientes = [];

  contracts
    .filter((c) => c.isActive !== false && c.client?.isActive !== false)
    .forEach((contrato) => {
      const cobrados = new Set(
        (contrato.collections || []).map((c) => `${c.year}-${c.month}`)
      );
      const desde = contrato.startDate
        ? new Date(Math.max(soloFecha(contrato.startDate), inicioRevision))
        : inicioRevision;
      const fin = contrato.endDate ? soloFecha(contrato.endDate) : null;

      mesesEntre(desde, finRevision).forEach(({ year, month }) => {
        const primeroDelMes = new Date(Date.UTC(year, month - 1, 1));
        if (fin && primeroDelMes > fin) return;
        if (cobrados.has(`${year}-${month}`)) return;

        const monto = rateForMonth(contrato.rates || [], month, year);
        if (!monto) return;

        const vence = dueDateFor(contrato, month, year);
        const diasParaVencer = Math.round((vence - hoy) / DIA_MS);
        if (diasParaVencer > aviso) return;

        pendientes.push({
          contractId: contrato.id,
          month,
          year,
          amount: Number(monto.amount),
          dueDate: iso(vence),
          daysLate: Math.max(0, -diasParaVencer),
          overdue: diasParaVencer < 0,
        });
      });
    });

  return pendientes.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
};

module.exports = { dueDateFor, pendingCollections, DIAS_DE_AVISO };
