/**
 * Quién puede ver y gestionar cuentas dentro de una empresa.
 *
 * - El gerente general (dueño, `isOwner`) es la cuenta que crea el súper
 *   administrador. Ve y gestiona a todos, incluidos los administradores.
 * - Un administrador común ve y gestiona solo al personal (EMPLOYEE) y su
 *   propia cuenta. No ve a los demás administradores.
 * - La cuenta del gerente general no se puede desactivar ni quitarle el rol
 *   desde el panel de la empresa; eso queda para el súper administrador.
 *
 * Módulo puro, sin Prisma: se puede probar sin base de datos.
 */

class AdminAccessError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AdminAccessError';
    this.code = 'ADMIN_ACCESS_DENIED';
  }
}

const esDueno = (actor) => Boolean(actor && actor.role === 'ADMIN' && actor.isOwner);

/** Filtro de listado: qué usuarios de su empresa puede ver quien consulta. */
const filtroDeVisibles = (actor) => {
  if (esDueno(actor)) return {};
  if (actor && actor.role === 'ADMIN') {
    return { OR: [{ role: 'EMPLOYEE' }, { id: actor.id }] };
  }
  return { id: actor ? actor.id : -1 };
};

/** ¿Puede crear una cuenta con este rol? */
const assertPuedeCrear = (actor, rol = 'EMPLOYEE') => {
  if (rol === 'ADMIN' && !esDueno(actor)) {
    throw new AdminAccessError('Solo el gerente general puede crear administradores');
  }
};

/**
 * ¿Puede modificar a `objetivo`? `cambios` es lo que se quiere guardar.
 * `accion` distingue editar de desactivar o restablecer la contraseña.
 */
const assertPuedeGestionar = (actor, objetivo, { accion = 'editar', cambios = {} } = {}) => {
  const esElMismo = actor && objetivo && actor.id === objetivo.id;

  if (objetivo.isOwner) {
    if (accion === 'desactivar') {
      throw new AdminAccessError('La cuenta del gerente general no se puede desactivar');
    }
    if (cambios.role && cambios.role !== 'ADMIN') {
      throw new AdminAccessError('El gerente general no puede dejar de ser administrador');
    }
    if (!esElMismo) {
      throw new AdminAccessError('Solo el gerente general puede modificar su propia cuenta');
    }
    return;
  }

  // Tocar a un administrador, o convertir a alguien en uno, es cosa del dueño.
  const involucraAdmin = objetivo.role === 'ADMIN' || cambios.role === 'ADMIN';
  if (involucraAdmin && !esDueno(actor) && !esElMismo) {
    throw new AdminAccessError('Solo el gerente general puede gestionar a los administradores');
  }
  if (esElMismo && cambios.role === 'ADMIN' && objetivo.role !== 'ADMIN') {
    throw new AdminAccessError('Solo el gerente general puede crear administradores');
  }
  if (esElMismo && accion === 'desactivar') {
    throw new AdminAccessError('No puede desactivar su propia cuenta');
  }
};

module.exports = {
  AdminAccessError,
  esDueno,
  filtroDeVisibles,
  assertPuedeCrear,
  assertPuedeGestionar,
};
