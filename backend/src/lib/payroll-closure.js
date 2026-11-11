/**
 * ¿Está cerrada la nómina de un mes?
 *
 * El sistema no tiene ningún concepto de "período cerrado": un `Payment` existe
 * por (empleado, mes, año) y nada más. En vez de agregar ese estado —que habría
 * que recordar marcar, y que se desincronizaría en cuanto alguien pagara a un
 * empleado olvidado— se deriva:
 *
 *     cerrada = todo el que debía cobrar ese mes tiene su pago
 *
 * Importa porque el estado de resultados toma los salarios de la nómina. Si
 * faltan pagos, el costo operativo y el saldo del mes son provisionales, y
 * mostrarlos como definitivos sería el error más caro de esa pantalla.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 */

/** Último instante del mes, en UTC. Con mes 1-12, no 0-11. */
const endOfMonth = (month, year) =>
  new Date(Date.UTC(Number(year), Number(month), 0, 23, 59, 59, 999));

/**
 * ¿El mes consultado ya terminó?
 *
 * El mes en curso nunca se considera cerrado aunque estén todos los pagos:
 * todavía puede entrar personal, o registrarse horas extra que cambien un
 * monto ya pagado.
 */
const monthHasEnded = (month, year, now = new Date()) => now > endOfMonth(month, year);

/**
 * Empleados que debían cobrar ese mes.
 *
 * El denominador tiene una trampa: usar "los activos hoy" daría mal al mirar
 * marzo si desde entonces se fue gente. Un empleado cuenta para el mes M si:
 *
 *   · tiene pago de M — aunque ya no esté activo, cobró y su sueldo es
 *     parte del costo de ese mes; o
 *   · sigue activo y ya existía antes de que M terminara, para que un alta
 *     de mayo no ensucie el estado de marzo.
 *
 * Queda un caso que no se puede resolver con los datos actuales: alguien que
 * trabajó en marzo, nunca cobró y después se dio de baja. No hay fecha de baja
 * en el modelo, así que desaparece del conteo. Es preferible a inventarla.
 *
 * @param {Array<{id:number, isActive:boolean, createdAt:Date|string}>} employees
 * @param {Array<{userId:number}>} payments pagos del mes consultado
 */
const expectedEmployees = (employees, payments, month, year) => {
  const conPago = new Set(payments.map((pago) => pago.userId));
  const finDeMes = endOfMonth(month, year);

  return employees.filter(
    (empleado) =>
      conPago.has(empleado.id) ||
      (empleado.isActive && new Date(empleado.createdAt) <= finDeMes)
  );
};

/**
 * Estado de la nómina de un mes.
 *
 * Devuelve siempre un resultado; nunca lanza. `reason` explica en una frase
 * por qué no está cerrada, para que la pantalla no tenga que redactarlo.
 */
const payrollClosure = (employees = [], payments = [], month, year, now = new Date()) => {
  const esperados = expectedEmployees(employees, payments, month, year);
  const pagados = payments.filter((pago) =>
    esperados.some((empleado) => empleado.id === pago.userId)
  );

  const faltantes = esperados.length - pagados.length;
  const mesTerminado = monthHasEnded(month, year, now);

  // Sin nadie a quien pagar no hay nada que esperar, pero tampoco tiene
  // sentido decir que "está cerrada": no hubo nómina.
  if (esperados.length === 0) {
    return {
      closed: mesTerminado,
      expected: 0,
      paid: 0,
      missing: 0,
      monthEnded: mesTerminado,
      reason: mesTerminado ? null : 'El mes todavía está en curso',
    };
  }

  if (faltantes > 0) {
    return {
      closed: false,
      expected: esperados.length,
      paid: pagados.length,
      missing: faltantes,
      monthEnded: mesTerminado,
      reason: `Faltan ${faltantes} de ${esperados.length} pagos de nómina`,
    };
  }

  return {
    closed: mesTerminado,
    expected: esperados.length,
    paid: pagados.length,
    missing: 0,
    monthEnded: mesTerminado,
    reason: mesTerminado ? null : 'El mes todavía está en curso y pueden entrar cambios',
  };
};

module.exports = { payrollClosure, expectedEmployees, monthHasEnded, endOfMonth };
