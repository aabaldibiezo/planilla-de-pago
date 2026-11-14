const { validationResult } = require('express-validator');
const userService = require('../services/user.service');
const auditService = require('../services/audit.service');

const getAll = async (req, res, next) => {
  try {
    const users = await userService.getAll(req.user);
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    // La clave temporal solo viaja en la respuesta al administrador; nunca
    // entra en la auditoría, que guarda `newData` tal cual.
    const { temporaryPassword, ...user } = await userService.create(
      req.user.companyId,
      req.body,
      req.user.id,
      req.user
    );
    await auditService.record(req, {
      action: 'CREATE',
      entity: 'User',
      entityId: user.id,
      employeeId: user.id,
      newData: user,
    });
    res.status(201).json({ success: true, data: { ...user, temporaryPassword } });
  } catch (error) {
    // Gestionar administradores es exclusivo del gerente general.
    if (error.name === 'AdminAccessError') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (/ya está registrado/.test(error.message)) {
      return res.status(409).json({ success: false, error: error.message });
    }
    if (/Indique el correo|El celular debe/.test(error.message)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    // El límite del plan lleva código propio para que el panel muestre el
    // aviso de "suba de plan" sin tener que interpretar el texto.
    if (error.name === 'PlanLimitError') {
      return res.status(409).json({ success: false, error: error.message, code: error.code });
    }
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const user = await userService.update(req.user.companyId, id, req.body, req.user.id, req.user);
    await auditService.record(req, {
      action: 'UPDATE',
      entity: 'User',
      entityId: user.id,
      employeeId: user.id,
      newData: user,
    });
    res.json({ success: true, data: user });
  } catch (error) {
    // Gestionar administradores es exclusivo del gerente general.
    if (error.name === 'AdminAccessError') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.message === 'Usuario no encontrado') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (/ya está registrado/.test(error.message)) {
      return res.status(409).json({ success: false, error: error.message });
    }
    if (/El celular debe/.test(error.message)) {
      return res.status(400).json({ success: false, error: error.message });
    }
    // Reactivar a un empleado dado de baja ocupa cupo del plan igual que un alta.
    if (error.name === 'PlanLimitError') {
      return res.status(409).json({ success: false, error: error.message, code: error.code });
    }
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const user = await userService.softDelete(req.user.companyId, id, req.user);
    await auditService.record(req, {
      action: 'DEACTIVATE',
      entity: 'User',
      entityId: id,
      employeeId: id,
      previousData: user,
    });
    res.json({ success: true, data: { message: 'Usuario desactivado correctamente' } });
  } catch (error) {
    // Gestionar administradores es exclusivo del gerente general.
    if (error.name === 'AdminAccessError') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.message === 'Usuario no encontrado') {
      return res.status(404).json({ success: false, error: error.message });
    }
    next(error);
  }
};

/**
 * Genera y reenvía una contraseña temporal. Responde 200 incluso si el correo
 * falla: la contraseña ya fue rotada y el administrador necesita saberlo.
 */
const resetPassword = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const user = await userService.resetPassword(req.user.companyId, id, req.user);
    await auditService.record(req, {
      action: 'RESET_PASSWORD',
      entity: 'User',
      entityId: user.id,
      employeeId: user.id,
      newData: { credentialsDelivered: user.credentialsDelivered },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    // Gestionar administradores es exclusivo del gerente general.
    if (error.name === 'AdminAccessError') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.message === 'Usuario no encontrado') {
      return res.status(404).json({ success: false, error: error.message });
    }
    if (error.message.includes('inactivo') || error.message.includes('no tiene correo')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
};

module.exports = { getAll, create, update, remove, resetPassword };
