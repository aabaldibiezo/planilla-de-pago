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

    const user = await userService.create(req.body, req.user.id);
    await auditService.record(req, { action: 'CREATE', entity: 'User', entityId: user.id, employeeId: user.id, newData: user });
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    if (error.message === 'El email ya está registrado') {
      return res.status(409).json({ success: false, error: error.message });
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

    const user = await userService.update(id, req.body, req.user.id);
    await auditService.record(req, { action: 'UPDATE', entity: 'User', entityId: user.id, employeeId: user.id, newData: user });
    res.json({ success: true, data: user });
  } catch (error) {
    if (error.message === 'Usuario no encontrado') {
      return res.status(404).json({ success: false, error: error.message });
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

    const user = await userService.softDelete(id);
    await auditService.record(req, { action: 'DEACTIVATE', entity: 'User', entityId: id, employeeId: id, previousData: user });
    res.json({ success: true, data: { message: 'Usuario desactivado correctamente' } });
  } catch (error) {
    if (error.message === 'Usuario no encontrado') {
      return res.status(404).json({ success: false, error: error.message });
    }
    next(error);
  }
};

module.exports = { getAll, create, update, remove };
