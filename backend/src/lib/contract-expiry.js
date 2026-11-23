/**
 * Contratos por vencer: los que terminan en las próximas 2 semanas, para
 * renovarlos a tiempo y no perder al cliente. También los que ya vencieron
 * hace poco y siguen activos (nadie los renovó ni los dio de baja), porque
 * son los más urgentes.
 *
 * Un contrato sin fecha de fin no vence: no se avisa.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 */

/** Días antes del fin en que empieza el aviso. */
const DIAS_DE_AVISO = 14;
/** Días después del fin en que el aviso sigue (si el contrato sigue activo). */
const DIAS_VENCIDO = 30;

const DIA_MS = 24 * 60 * 60 * 1000;
const soloFecha = (valor) => {
  const f = new Date(valor);
  return new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate()));
};

/**
 * `contratos`: [{ id, endDate, isActive, ... }]. Devuelve los que hay que
 * avisar, del más urgente al menos: { contractId, endDate, daysLeft, expired }.
 * `daysLeft` negativo = vencido hace esos días.
 */
const contratosPorVencer = (contratos, hoy = new Date(), { aviso = DIAS_DE_AVISO } = {}) => {
  const hoyFecha = soloFecha(hoy);
  return contratos
    .filter((c) => c.isActive !== false && c.endDate)
    .map((c) => {
      const fin = soloFecha(c.endDate);
      const daysLeft = Math.round((fin - hoyFecha) / DIA_MS);
      return {
        contractId: c.id,
        endDate: fin.toISOString().slice(0, 10),
        daysLeft,
        expired: daysLeft < 0,
      };
    })
    .filter((c) => c.daysLeft <= aviso && c.daysLeft >= -DIAS_VENCIDO)
    .sort((a, b) => a.daysLeft - b.daysLeft);
};

module.exports = { DIAS_DE_AVISO, DIAS_VENCIDO, contratosPorVencer };
