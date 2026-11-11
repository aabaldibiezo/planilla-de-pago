const { Router } = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();

// POST /api/auth/login
router.post(
  '/login',
  [
    // El campo se sigue llamando `email` por compatibilidad con la app ya
    // instalada, pero acepta correo o celular.
    body('email').trim().notEmpty().withMessage('Ingrese su correo o celular'),
    body('password').notEmpty().withMessage('Contraseña requerida'),
  ],
  authController.login
);

// Rutas del usuario autenticado. No llevan `blockUntilPasswordChanged`:
// son justamente las que permiten salir del estado de contraseña temporal.
router.get('/me', authenticate, authController.getProfile);

router.put(
  '/me',
  authenticate,
  [
    body('firstName').optional().trim().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('lastName').optional().trim().notEmpty().withMessage('El apellido no puede estar vacío'),
    body('phone').optional({ nullable: true }).trim().isLength({ max: 30 }),
  ],
  authController.updateProfile
);

router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty().withMessage('Debe indicar su contraseña actual'),
    body('newPassword')
      .isLength({ min: 8 })
      .withMessage('La nueva contraseña debe tener al menos 8 caracteres'),
  ],
  authController.changePassword
);

module.exports = router;
