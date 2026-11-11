/**
 * Celular como dato de acceso.
 *
 * Un empleado fijo se identifica con su correo o su celular; con cualquiera
 * de los dos entra a la aplicación. El celular se guarda normalizado (solo
 * dígitos, sin el 591 de Bolivia) para que "7170-0001", "+591 71700001" y
 * "71700001" sean el mismo usuario al registrarlo y al iniciar sesión.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 */

const normalizePhone = (valor) => {
  if (valor == null) return null;
  let digitos = String(valor).replace(/\D/g, '');
  if (digitos.length === 11 && digitos.startsWith('591')) digitos = digitos.slice(3);
  return digitos || null;
};

/** ¿Lo escrito en el campo de acceso es un correo (y no un celular)? */
const isEmailLike = (valor) => String(valor || '').includes('@');

/** Celular boliviano: 8 dígitos, empieza en 6 o 7. */
const isValidPhone = (valor) => /^[67]\d{7}$/.test(normalizePhone(valor) || '');

module.exports = { normalizePhone, isEmailLike, isValidPhone };
