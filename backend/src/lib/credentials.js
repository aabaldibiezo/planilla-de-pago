const crypto = require('crypto');

/**
 * Alfabeto sin caracteres ambiguos: se omiten 0/O, 1/l/I y 5/S.
 * La contraseña temporal se teclea en el celular del empleado, así que la
 * legibilidad pesa más que la longitud.
 */
const UPPERCASE = 'ABCDEFGHJKMNPQRTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnpqrtuvwxyz';
const DIGITS = '234679';
const ALPHABET = UPPERCASE + LOWERCASE + DIGITS;
const DEFAULT_LENGTH = 10;

/**
 * Elige un carácter al azar de `alphabet`.
 *
 * Usa rejection sampling en vez de `% alphabet.length` para no sesgar el
 * resultado hacia los primeros caracteres.
 */
const pickChar = (alphabet) => {
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  for (;;) {
    const byte = crypto.randomBytes(1)[0];
    if (byte < max) return alphabet[byte % alphabet.length];
  }
};

/**
 * Genera una contraseña temporal con aleatoriedad criptográfica.
 *
 * Garantiza al menos una letra y un dígito: si se eligiera libremente del
 * alfabeto completo, podría salir una contraseña sin números que incumpliría
 * la política que exige `assertPasswordStrength`.
 */
const generateTemporaryPassword = (length = DEFAULT_LENGTH) => {
  if (length < 4) throw new Error('La contraseña temporal debe tener al menos 4 caracteres');

  const chars = [pickChar(UPPERCASE), pickChar(LOWERCASE), pickChar(DIGITS)];
  while (chars.length < length) {
    chars.push(pickChar(ALPHABET));
  }

  // Fisher-Yates para que las posiciones garantizadas no queden siempre al inicio.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
};

/** Requisitos mínimos para una contraseña elegida por el propio usuario. */
const assertPasswordStrength = (password) => {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres');
  }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error('La contraseña debe combinar letras y números');
  }
};

module.exports = { generateTemporaryPassword, assertPasswordStrength, ALPHABET };
