/**
 * Reglas de la suscripción de plataforma.
 *
 * ⚠️ Todo el dinero de este módulo está en DÓLARES (USD). Los sueldos y las
 * boletas del resto del sistema están en bolivianos. No hay conversión entre
 * ambas monedas y no debe haberla.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 */

/** Días antes del vencimiento en que se avisa a la empresa. */
const DIAS_DE_AVISO = 2;

/** Fecha sin hora, en UTC, para comparar vencimientos sin arrastrar husos. */
const soloFecha = (valor) => {
  const fecha = new Date(valor);
  return new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())
  );
};

/**
 * Suma un mes a una fecha respetando los meses cortos.
 *
 * `setUTCMonth(+1)` sobre un 31 de enero devuelve el 3 de marzo, porque
 * desborda al 31 de febrero. Acá se recorta al último día del mes destino, de
 * modo que un vencimiento el 31 de enero pasa al 28 (o 29) de febrero y no se
 * corre de mes.
 */
const sumarUnMes = (valor) => {
  const base = soloFecha(valor);
  const dia = base.getUTCDate();
  const objetivo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
  const ultimoDiaDelMes = new Date(
    Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)
  ).getUTCDate();

  objetivo.setUTCDate(Math.min(dia, ultimoDiaDelMes));
  return objetivo;
};

/**
 * Próximo vencimiento tras registrar un pago.
 *
 * Se cuenta desde el vencimiento anterior, no desde la fecha de pago: quien
 * paga diez días tarde no gana diez días gratis, y el ciclo de cobro no se
 * desplaza mes a mes.
 *
 * Si la empresa quedó varios meses atrasada, se avanza hasta pasar la fecha
 * del pago; cada mes cubierto exige su propio registro de pago, así que
 * ponerse al día requiere cargarlos todos.
 */
const proximoVencimiento = (vencimientoActual, fechaDePago = new Date()) => {
  let siguiente = sumarUnMes(vencimientoActual);
  const pago = soloFecha(fechaDePago);

  // Cota defensiva: sin ella, una fecha corrupta haría un bucle infinito.
  let vueltas = 0;
  while (siguiente <= pago && vueltas < 120) {
    siguiente = sumarUnMes(siguiente);
    vueltas += 1;
  }

  return siguiente;
};

/** ¿El vencimiento ya pasó? El día del vencimiento todavía se considera al día. */
const estaVencida = (nextDueDate, hoy = new Date()) => soloFecha(nextDueDate) < soloFecha(hoy);

/** Días que faltan para el vencimiento; negativo si ya pasó. */
const diasHastaVencimiento = (nextDueDate, hoy = new Date()) =>
  Math.round((soloFecha(nextDueDate) - soloFecha(hoy)) / 86400000);

/**
 * ¿Corresponde enviar el aviso previo?
 *
 * `reminderSentFor` guarda el vencimiento para el que ya se avisó. Comparar
 * contra él (y no un booleano) hace que el aviso se rearme solo cuando el
 * vencimiento cambia, sin necesidad de limpiar ninguna bandera.
 */
const debeAvisar = (company, hoy = new Date()) => {
  if (company.status !== 'ACTIVE') return false;

  const dias = diasHastaVencimiento(company.nextDueDate, hoy);
  if (dias < 0 || dias > DIAS_DE_AVISO) return false;

  if (!company.reminderSentFor) return true;

  return soloFecha(company.reminderSentFor).getTime() !== soloFecha(company.nextDueDate).getTime();
};

/**
 * Etiqueta de estado para el panel de plataforma.
 * "Por vencer" no es un estado almacenado: se deriva de la cercanía de la fecha.
 */
const etiquetaDeEstado = (company, hoy = new Date()) => {
  if (company.status === 'READ_ONLY') return 'SUSPENDIDA';
  return diasHastaVencimiento(company.nextDueDate, hoy) <= DIAS_DE_AVISO
    ? 'POR_VENCER'
    : 'ACTIVA';
};

module.exports = {
  DIAS_DE_AVISO,
  soloFecha,
  sumarUnMes,
  proximoVencimiento,
  estaVencida,
  diasHastaVencimiento,
  debeAvisar,
  etiquetaDeEstado,
};
