const { validationResult } = require('express-validator');
const authService = require('../services/auth.service');

const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, error: errors.array()[0].msg });
    }

    const { email, password } = req.body;
    const result = await authService.login(email, password);

    res.json({ success: true, data: result });
  } catch (error) {
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

module.exports = { login, getProfile };
