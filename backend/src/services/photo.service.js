const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cloudinaryService = require('./cloudinary.service');

/**
 * Almacenamiento de fotos: marcaciones de asistencia y recibos firmados.
 *
 * El cliente envía la imagen como data URI. El servidor valida que sea
 * realmente una imagen antes de guardarla: el cliente controla lo que manda,
 * así que su palabra sobre el tipo de contenido no basta.
 */

const MAX_BYTES = 3 * 1024 * 1024; // 3 MB ya decodificados

/** Firmas binarias de los formatos aceptados. */
const SIGNATURES = [
  { mime: 'image/jpeg', extension: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', extension: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
];

const detectFormat = (buffer) =>
  SIGNATURES.find((signature) => signature.bytes.every((byte, index) => buffer[index] === byte)) ||
  null;

/**
 * Decodifica y valida un data URI de imagen.
 * Lanza un error de dominio si el contenido no es una imagen aceptable.
 */
const decodeImage = (dataUri) => {
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
    throw new Error('La foto debe enviarse como data URI');
  }

  const separador = dataUri.indexOf(',');
  if (separador === -1) throw new Error('La foto tiene un formato inválido');

  const buffer = Buffer.from(dataUri.slice(separador + 1), 'base64');

  if (buffer.length === 0) throw new Error('La foto llegó vacía');
  if (buffer.length > MAX_BYTES) {
    throw new Error(`La foto supera el tamaño máximo de ${MAX_BYTES / 1024 / 1024} MB`);
  }

  // Se ignora el tipo declarado en el data URI y se comprueba el contenido real.
  const formato = detectFormat(buffer);
  if (!formato) throw new Error('El archivo enviado no es una imagen JPEG o PNG válida');

  return { buffer, ...formato };
};

/**
 * Carpeta local de un tipo de foto, bajo `backend/uploads/`.
 *
 * Todo lo que cae ahí está cubierto por el `.gitignore`: son datos personales
 * —caras en las marcaciones, recibos firmados con nombre y monto— y no deben
 * llegar nunca al repositorio.
 */
const localDir = (carpeta) => {
  const dir = path.join(__dirname, '../../uploads', carpeta);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
};

/** Nombre no adivinable: estas fotos son datos personales. */
const tokenAleatorio = () => crypto.randomBytes(12).toString('hex');

/**
 * Guarda una imagen, validándola primero.
 *
 * Con Cloudinary configurado sube ahí; si no, escribe en disco local para que
 * el flujo sea probable en desarrollo. En producción el disco es efímero, por
 * eso `CLOUDINARY_*` es obligatorio según `config/env.js`.
 */
const storePhoto = async (dataUri, { carpeta, publicId }) => {
  const { buffer, extension, mime } = decodeImage(dataUri);

  if (cloudinaryService.configured()) {
    const subida = await cloudinaryService.uploadImage(dataUri, publicId);
    return { url: subida.url, publicId: subida.publicId, bytes: buffer.length, mime };
  }

  const nombreArchivo = `${publicId.replace(/\//g, '_')}.${extension}`;
  const rutaCompleta = path.join(localDir(carpeta), nombreArchivo);
  await fs.promises.writeFile(rutaCompleta, buffer);

  return { url: rutaCompleta, publicId, bytes: buffer.length, mime, local: true };
};

/** Foto de una marcación de asistencia. */
const storeAttendancePhoto = (dataUri, { userId, workDate }) => {
  const fecha = new Date(workDate).toISOString().slice(0, 10);
  return storePhoto(dataUri, {
    carpeta: 'attendance',
    publicId: `planilla/asistencia/${fecha}/emp-${userId}-${tokenAleatorio()}`,
  });
};

/**
 * Foto del recibo físico que el empleado firmó al cobrar.
 *
 * El monto NO se lee de la imagen: sigue saliendo del cálculo de nómina. Esto
 * es solo el respaldo de que el pago se entregó y quedó firmado. Interpretar
 * un número manuscrito y usarlo como cifra contable metería un error que
 * nadie revisaría.
 */
const storeReceiptPhoto = (dataUri, { paymentId, userId, month, year }) => {
  const mes = String(month).padStart(2, '0');
  return storePhoto(dataUri, {
    carpeta: 'recibos',
    publicId: `planilla/recibos/${year}/${mes}/pago-${paymentId}-emp-${userId}-${tokenAleatorio()}`,
  });
};

module.exports = {
  decodeImage,
  storePhoto,
  storeAttendancePhoto,
  storeReceiptPhoto,
  MAX_BYTES,
};
