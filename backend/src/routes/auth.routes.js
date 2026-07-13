const { Router } = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();

// POST /api/auth/login
router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Email válido requerido'),
    body('password').notEmpty().withMessage('Contraseña requerida'),
  ],
  authController.login
);

// GET /api/auth/me
router.get('/me', authenticate, authController.getProfile);

module.exports = router;
