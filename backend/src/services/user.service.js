const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const scheduleService = require('./schedule.service');
const crypto = require('crypto');

/**
 * Get all active users (excluding passwords).
 */
const getAll = async (requestingUser) => {
  return prisma.user.findMany({
    where: requestingUser?.role === 'ADMIN' ? { isActive: true } : { id: requestingUser.id, isActive: true },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      employeeType: true,
      monthlySalary: true,
      monthlyHours: true,
      hourlyRate: true,
      scheduledEntryTime: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      scheduleType: true,
      scheduleBlocks: { where: { isActive: true }, orderBy: [{ dayOfWeek: 'asc' }, { blockOrder: 'asc' }] },
    },
    orderBy: { lastName: 'asc' },
  });
};

/**
 * Create a new user.
 * Calculates hourlyRate automatically.
 * Password is set to a default since they don't log in, but it is required in the DB schema.
 */
const create = async (data, actorId) => {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new Error('El email ya está registrado');
  }

  // Calculate hourly rate: monthlySalary / monthlyHours
  const monthlySalary = parseFloat(data.monthlySalary || 0);
  const monthlyHours = parseFloat(data.monthlyHours || 160);
  let hourlyRate = 0;
  if (monthlyHours > 0) {
    hourlyRate = parseFloat((monthlySalary / monthlyHours).toFixed(2));
  }

  const salt = await bcrypt.genSalt(10);
  if ((data.role || 'EMPLOYEE') === 'ADMIN' && !data.password) throw new Error('La contraseña es obligatoria para administradores');
  const defaultPassword = data.password || crypto.randomBytes(32).toString('base64url');
  const hashedPassword = await bcrypt.hash(defaultPassword, salt);

  const user = await prisma.$transaction(async tx => {
    const created = await tx.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role || 'EMPLOYEE',
      employeeType: data.employeeType || 'FIJO',
      monthlySalary,
      monthlyHours,
      hourlyRate,
      scheduledEntryTime: data.scheduledEntryTime || '08:00',
      scheduleType: data.scheduleType || 'FULL_TIME',
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      employeeType: true,
      monthlySalary: true,
      monthlyHours: true,
      hourlyRate: true,
      scheduledEntryTime: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      scheduleType: true,
    },
  });
    if (data.scheduleBlocks?.length) await scheduleService.replaceForUser(tx, created.id, data.scheduleType || 'FULL_TIME', data.scheduleBlocks, actorId);
    return tx.user.findUnique({where:{id:created.id},include:{scheduleBlocks:{where:{isActive:true},orderBy:[{dayOfWeek:'asc'},{blockOrder:'asc'}]}}});
  });
  return user;
};

/**
 * Update a user.
 * Re-calculates hourlyRate if monthlySalary or monthlyHours changes.
 */
const update = async (id, data, actorId) => {
  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) {
    throw new Error('Usuario no encontrado');
  }

  const updateData = {};
  if (data.email !== undefined) updateData.email = data.email;
  if (data.firstName !== undefined) updateData.firstName = data.firstName;
  if (data.lastName !== undefined) updateData.lastName = data.lastName;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.employeeType !== undefined) updateData.employeeType = data.employeeType;
  if (data.scheduledEntryTime !== undefined) updateData.scheduledEntryTime = data.scheduledEntryTime;
  if (data.scheduleType !== undefined) updateData.scheduleType = data.scheduleType;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;

  // Handle salary and hour changes to re-calculate hourlyRate
  const monthlySalary = data.monthlySalary !== undefined ? parseFloat(data.monthlySalary) : parseFloat(existingUser.monthlySalary);
  const monthlyHours = data.monthlyHours !== undefined ? parseFloat(data.monthlyHours) : parseFloat(existingUser.monthlyHours);
  
  if (data.monthlySalary !== undefined) updateData.monthlySalary = monthlySalary;
  if (data.monthlyHours !== undefined) updateData.monthlyHours = monthlyHours;

  if (monthlyHours > 0) {
    updateData.hourlyRate = parseFloat((monthlySalary / monthlyHours).toFixed(2));
  } else {
    updateData.hourlyRate = 0;
  }

  if (data.password) {
    const salt = await bcrypt.genSalt(10);
    updateData.password = await bcrypt.hash(data.password, salt);
  }

  const user = await prisma.$transaction(async tx => {
    await tx.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      employeeType: true,
      monthlySalary: true,
      monthlyHours: true,
      hourlyRate: true,
      scheduledEntryTime: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      scheduleType: true,
    },
  });
    if (data.scheduleBlocks?.length) await scheduleService.replaceForUser(tx,id,data.scheduleType || existingUser.scheduleType,data.scheduleBlocks,actorId);
    return tx.user.findUnique({where:{id},include:{scheduleBlocks:{where:{isActive:true},orderBy:[{dayOfWeek:'asc'},{blockOrder:'asc'}]}}});
  });
  return user;
};

/**
 * Soft-delete a user by setting isActive to false.
 */
const softDelete = async (id) => {
  const existingUser = await prisma.user.findUnique({ where: { id } });
  if (!existingUser) {
    throw new Error('Usuario no encontrado');
  }

  return prisma.user.update({
    where: { id },
    data: { isActive: false },
  });
};

module.exports = { getAll, create, update, softDelete };
