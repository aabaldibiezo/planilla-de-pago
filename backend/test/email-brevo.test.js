const test = require('node:test');
const assert = require('node:assert/strict');

const { separarRemitente, armarCuerpoBrevo } = require('../src/services/email.service');

test('separa "Nombre <correo>"', () => {
  assert.deepEqual(separarRemitente('"Limpieza Mendoza" <ventas@x.com>'), {
    name: 'Limpieza Mendoza',
    email: 'ventas@x.com',
  });
});

test('un correo solo usa el nombre por defecto', () => {
  assert.deepEqual(separarRemitente('ventas@x.com'), {
    name: 'Planilla de Pago',
    email: 'ventas@x.com',
  });
});

test('sin remitente queda el correo vacío', () => {
  assert.equal(separarRemitente(undefined).email, '');
});

test('arma el cuerpo de Brevo con texto y HTML', () => {
  const cuerpo = armarCuerpoBrevo(
    { to: 'juan@x.com', subject: 'Hola', text: 'texto', html: '<p>hola</p>' },
    { name: 'Planilla de Pago', email: 'ventas@x.com' }
  );
  assert.deepEqual(cuerpo, {
    sender: { name: 'Planilla de Pago', email: 'ventas@x.com' },
    to: [{ email: 'juan@x.com' }],
    subject: 'Hola',
    textContent: 'texto',
    htmlContent: '<p>hola</p>',
  });
});

test('sin HTML no manda htmlContent', () => {
  const cuerpo = armarCuerpoBrevo(
    { to: 'a@x.com', subject: 's', text: 't' },
    { name: 'n', email: 'e@x.com' }
  );
  assert.equal('htmlContent' in cuerpo, false);
});
