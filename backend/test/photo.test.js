const test = require('node:test');
const assert = require('node:assert/strict');

const { decodeImage, MAX_BYTES } = require('../src/services/photo.service');

/** Construye un data URI a partir de bytes crudos. */
const dataUri = (bytes, mime = 'image/jpeg') =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test('acepta una imagen JPEG', () => {
  const resultado = decodeImage(dataUri(JPEG));
  assert.equal(resultado.mime, 'image/jpeg');
  assert.equal(resultado.extension, 'jpg');
});

test('acepta una imagen PNG', () => {
  const resultado = decodeImage(dataUri(PNG, 'image/png'));
  assert.equal(resultado.mime, 'image/png');
  assert.equal(resultado.extension, 'png');
});

test('ignora el tipo declarado y valida el contenido real', () => {
  // Un archivo de texto disfrazado de JPEG debe rechazarse: el cliente controla
  // la cabecera del data URI, así que su palabra no basta.
  const textoPlano = Buffer.from('esto no es una imagen').toJSON().data;
  assert.throws(() => decodeImage(dataUri(textoPlano, 'image/jpeg')), /no es una imagen/);
});

test('rechaza un ejecutable disfrazado de imagen', () => {
  // Cabecera MZ de un ejecutable de Windows.
  const ejecutable = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00];
  assert.throws(() => decodeImage(dataUri(ejecutable, 'image/png')), /no es una imagen/);
});

test('rechaza contenido que no sea un data URI', () => {
  assert.throws(() => decodeImage('https://ejemplo.com/foto.jpg'), /data URI/);
  assert.throws(() => decodeImage(''), /data URI/);
  assert.throws(() => decodeImage(null), /data URI/);
});

test('rechaza un data URI mal formado', () => {
  assert.throws(() => decodeImage('data:image/jpeg;base64'), /formato inválido/);
});

test('rechaza una foto vacía', () => {
  assert.throws(() => decodeImage('data:image/jpeg;base64,'), /vacía/);
});

test('rechaza fotos que superan el tamaño máximo', () => {
  const enorme = Buffer.alloc(MAX_BYTES + 1024);
  // Cabecera JPEG válida para que falle por tamaño y no por formato.
  JPEG.forEach((byte, index) => {
    enorme[index] = byte;
  });
  assert.throws(
    () => decodeImage(`data:image/jpeg;base64,${enorme.toString('base64')}`),
    /tamaño máximo/
  );
});
