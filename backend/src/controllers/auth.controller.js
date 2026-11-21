const { validationResult } = require('express-validator');
const authService = require('../services/auth.service');
const userService = require('../services/user.service');
const auditService = require('../services/audit.service');

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { email, password } = req.body;
    const result = await authService.login(email, password, req.body.client || null);

    // Cada ingreso queda en el registro de actividad de la empresa, con desde
    // dónde se entró (panel web o app del celular).
    if (result.user?.companyId) {
      const desde = req.body.client === 'web' ? 'el panel web' : 'la app del celular';
      auditService
        .record(
          { user: result.user, ip: req.ip, get: (h) => req.get(h) },
          {
            action: 'ACTIVIDAD',
            entity: 'Cuenta',
            entityId: result.user.id,
            newData: { descripcion: `Ingresó al sistema desde ${desde}` },
          }
        )
        .catch((error) => console.error('No se pudo registrar el ingreso:', error.message));
    }

    res.json({ success: true, data: result });
  } catch (error) {
    if (error.code === 'SOLO_APP') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.code === 'COMPANY_INACTIVE') {
      return res.status(403).json({ success: false, error: error.message, code: error.code });
    }
    if (error.message === 'Credenciales inválidas') {
      return res.status(401).json({ success: false, error: error.message });
    }
    next(error);
  }
};

const getProfile = async (req, res, next) => {
  try {
    const user = await authService.getProfile(req.user.id);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

const updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const user = await authService.updateOwnProfile(req.user.id, req.body);
    await auditService.record(req, {
      action: 'UPDATE_PROFILE',
      entity: 'User',
      entityId: user.id,
      employeeId: user.id,
      newData: user,
    });

    res.json({ success: true, data: user });
  } catch (error) {
    if (error.message.includes('No se enviaron datos')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await userService.changeOwnPassword(req.user.id, currentPassword, newPassword);

    // Nunca se registra ninguna de las dos contraseñas en la auditoría.
    await auditService.record(req, {
      action: 'CHANGE_PASSWORD',
      entity: 'User',
      entityId: user.id,
      employeeId: user.id,
    });

    res.json({ success: true, data: { message: 'Contraseña actualizada correctamente' } });
  } catch (error) {
    if (
      error.message.includes('contraseña actual') ||
      error.message.includes('debe tener') ||
      error.message.includes('debe combinar') ||
      error.message.includes('distinta')
    ) {
      return res.status(400).json({ success: false, error: error.message });
    }
    next(error);
  }
};

module.exports = { login, getProfile, updateProfile, changePassword };
