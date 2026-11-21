const test = require('node:test');
const assert = require('node:assert/strict');

const { describirActividad } = require('../src/lib/actividad');

test('descargar una boleta se registra', () => {
  assert.deepEqual(describirActividad('GET', '/payments/12/pdf'), {
    seccion: 'Pagos',
    descripcion: 'Descargó una boleta de pago',
    entidadId: '12',
  });
});

test('el reporte mensual se registra aunque lleve query', () => {
  assert.equal(
    describirActividad('GET', '/payments/monthly-report?month=11&year=2026').descripcion,
    'Descargó el reporte mensual de pagos'
  );
});

test('una consulta común no se registra', () => {
  assert.equal(describirActividad('GET', '/users'), null);
  assert.equal(describirActividad('GET', '/payments/history'), null);
});

test('crear, editar y desactivar empleados tienen texto propio', () => {
  assert.equal(describirActividad('POST', '/users').descripcion, 'Creó un empleado');
  assert.equal(describirActividad('PUT', '/users/7').descripcion, 'Editó los datos de un empleado');
  assert.equal(describirActividad('DELETE', '/users/7').descripcion, 'Desactivó a un empleado');
});

test('subir y borrar el recibo firmado', () => {
  assert.equal(describirActividad('POST', '/payments/3/receipt').descripcion, 'Subió la foto del recibo firmado');
  assert.equal(describirActividad('DELETE', '/payments/3/receipt').descripcion, 'Borró la foto del recibo firmado');
});

test('una acción sin texto propio usa uno genérico por sección', () => {
  assert.deepEqual(describirActividad('DELETE', '/clients/4'), {
    seccion: 'Clientes y contratos',
    descripcion: 'Eliminó en Clientes y contratos',
    entidadId: '4',
  });
});

test('el login y las rutas desconocidas no pasan por acá', () => {
  assert.equal(describirActividad('POST', '/auth/login'), null);
  assert.equal(describirActividad('POST', '/platform/companies'), null);
  assert.equal(describirActividad('POST', '/otra-cosa'), null);
});
