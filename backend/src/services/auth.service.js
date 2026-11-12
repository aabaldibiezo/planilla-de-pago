const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { PUBLIC_FIELDS } = require('./user.service');
const { normalizePhone, isEmailLike } = require('../lib/contact');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Autentica al usuario y devuelve un JWT.
 *
 * `mustChangePassword` viaja en la respuesta para que el cliente (web o móvil)
 * lleve al usuario directo a la pantalla de cambio de contraseña.
 */
const login = async (identifier, password) => {
  // Se entra con el correo o con el celular. Los dos son únicos a nivel
  // global, así que la búsqueda no lleva empresa: es justamente lo que hace
  // posible un único formulario de acceso para súper administradores,
  // administradores de empresa y empleados.
  const where = isEmailLike(identifier)
    ? { email: String(identifier).trim() }
    : { phone: normalizePhone(identifier) || '-' };
  const user = await prisma.user.findUnique({
    where,
    include: { company: { include: { plan: true } } },
  });

  if (!user || !user.isActive) {
    throw new Error('Credenciales inválidas');
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw new Error('Credenciales inválidas');
  }

  // Una empresa dada de baja no puede acceder; una vencida sí, en solo lectura.
  if (user.company && !user.company.isActive) {
    const error = new Error(
      'El acceso de su empresa está suspendido. Comuníquese con el proveedor del sistema.'
    );
    error.code = 'COMPANY_INACTIVE';
    throw error;
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const { password: _password, company, ...userWithoutPassword } = user;

  return {
    token,
    user: userWithoutPassword,
    mustChangePassword: user.mustChangePassword,
    // El cliente necesita el estado para mostrar el aviso de solo lectura sin
    // esperar a que una escritura falle con 403.
    company: company
      ? {
          id: company.id,
          name: company.name,
          status: company.status,
          nextDueDate: company.nextDueDate,
          planName: company.plan.name,
        }
      : null,
  };
};

/**
 * Perfil del usuario autenticado, incluyendo sus bloques de horario.
 */
const getProfile = async (userId) => {
  // Consulta sobre el propio usuario autenticado: el ámbito es su propio id,
  // así que no necesita acotarse por empresa.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      ...PUBLIC_FIELDS,
      company: {
        select: { id: true, name: true, status: true, nextDueDate: true },
      },
      scheduleBlocks: {
        where: { isActive: true },
        orderBy: [{ dayOfWeek: 'asc' }, { blockOrder: 'asc' }],
      },
    },
  });

  if (!user) {
    throw new Error('Usuario no encontrado');
  }

  return user;
};

/**
 * Datos que el propio usuario puede modificar de su perfil.
 * Deliberadamente no incluye rol, salario, horario ni estado.
 */
const updateOwnProfile = async (userId, data) => {
  const updateData = {};
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.phone !== undefined) updateData.phone = data.phone || null;

  if (Object.keys(updateData).length === 0) {
    throw new Error('No se enviaron datos para actualizar');
  }

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: PUBLIC_FIELDS,
  });
};

module.exports = { login, getProfile, updateOwnProfile };
