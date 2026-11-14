const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filtroDeVisibles,
  assertPuedeCrear,
  assertPuedeGestionar,
} = require('../src/lib/admin-access');

const dueno = { id: 1, role: 'ADMIN', isOwner: true };
const admin = { id: 2, role: 'ADMIN', isOwner: false };
const otroAdmin = { id: 3, role: 'ADMIN', isOwner: false };
const empleado = { id: 4, role: 'EMPLOYEE', isOwner: false };

// --------------- Qué se ve ---------------

test('el gerente general ve a todos', () => {
  assert.deepEqual(filtroDeVisibles(dueno), {});
});

test('un administrador común ve al personal y a sí mismo', () => {
  assert.deepEqual(filtroDeVisibles(admin), { OR: [{ role: 'EMPLOYEE' }, { id: 2 }] });
});

test('un empleado solo se ve a sí mismo', () => {
  assert.deepEqual(filtroDeVisibles(empleado), { id: 4 });
});

// --------------- Altas ---------------

test('solo el gerente general crea administradores', () => {
  assert.doesNotThrow(() => assertPuedeCrear(dueno, 'ADMIN'));
  assert.throws(() => assertPuedeCrear(admin, 'ADMIN'), /gerente general/);
});

test('cualquier administrador crea empleados', () => {
  assert.doesNotThrow(() => assertPuedeCrear(admin, 'EMPLOYEE'));
  assert.doesNotThrow(() => assertPuedeCrear(admin));
});

// --------------- Gestión ---------------

test('un administrador común no toca a otro administrador', () => {
  assert.throws(() => assertPuedeGestionar(admin, otroAdmin), /gerente general/);
  assert.throws(
    () => assertPuedeGestionar(admin, otroAdmin, { accion: 'desactivar' }),
    /gerente general/
  );
});

test('un administrador común no puede ascender a un empleado a administrador', () => {
  assert.throws(
    () => assertPuedeGestionar(admin, empleado, { cambios: { role: 'ADMIN' } }),
    /gerente general/
  );
});

test('un administrador común gestiona empleados y edita su propia cuenta', () => {
  assert.doesNotThrow(() => assertPuedeGestionar(admin, empleado));
  assert.doesNotThrow(() => assertPuedeGestionar(admin, empleado, { accion: 'desactivar' }));
  assert.doesNotThrow(() => assertPuedeGestionar(admin, admin, { cambios: { firstName: 'X' } }));
});

test('nadie se desactiva a sí mismo', () => {
  assert.throws(() => assertPuedeGestionar(admin, admin, { accion: 'desactivar' }), /propia/);
});

test('el gerente general gestiona a los administradores', () => {
  assert.doesNotThrow(() => assertPuedeGestionar(dueno, admin));
  assert.doesNotThrow(() => assertPuedeGestionar(dueno, admin, { accion: 'desactivar' }));
  assert.doesNotThrow(() => assertPuedeGestionar(dueno, empleado, { cambios: { role: 'ADMIN' } }));
});

test('la cuenta del gerente general no se desactiva ni pierde el rol', () => {
  assert.throws(() => assertPuedeGestionar(dueno, dueno, { accion: 'desactivar' }), /no se puede/);
  assert.throws(
    () => assertPuedeGestionar(dueno, dueno, { cambios: { role: 'EMPLOYEE' } }),
    /dejar de ser/
  );
});

test('otro administrador no modifica al gerente general', () => {
  assert.throws(() => assertPuedeGestionar(admin, dueno), /propia cuenta/);
});

test('el gerente general edita su propia cuenta', () => {
  assert.doesNotThrow(() => assertPuedeGestionar(dueno, dueno, { cambios: { firstName: 'Y' } }));
});
