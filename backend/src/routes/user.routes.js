const { Router } = require('express');
const { body } = require('express-validator');
const userController = require('../controllers/user.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

// GET /api/users
router.get('/', userController.getAll);
router.use(requireAdmin);

// POST /api/users
router.post(
  '/',
  [
    body('email').isEmail().withMessage('Email válido requerido'),
    body('password').optional().isLength({ min: 6 }).withMessage('Contraseña mínimo 6 caracteres'),
    body('firstName').notEmpty().withMessage('Nombre requerido'),
    body('lastName').notEmpty().withMessage('Apellido requerido'),
    body('role').optional().isIn(['ADMIN', 'EMPLOYEE']).withMessage('Rol debe ser ADMIN o EMPLOYEE'),
    body('employeeType').isIn(['FIJO', 'TEMPORAL']).withMessage('Tipo de empleado debe ser FIJO o TEMPORAL'),
    body('monthlySalary').isFloat({ min: 0 }).withMessage('Salario mensual debe ser >= 0'),
    body('monthlyHours').isFloat({ min: 1 }).withMessage('Horas mensuales deben ser >= 1'),
    body('scheduledEntryTime').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Hora programada debe ser en formato HH:MM'),
    body('scheduleType').optional().isIn(['FULL_TIME','FLEXIBLE','SPECIFIC_DAYS']),
    body('scheduleBlocks').optional().isArray({ min: 1 }),
  ],
  userController.create
);

// PUT /api/users/:id
router.put(
  '/:id',
  [
    body('email').optional().isEmail().withMessage('Email válido requerido'),
    body('password').optional().isLength({ min: 6 }).withMessage('Contraseña mínimo 6 caracteres'),
    body('firstName').optional().notEmpty().withMessage('Nombre no puede estar vacío'),
    body('lastName').optional().notEmpty().withMessage('Apellido no puede estar vacío'),
    body('role').optional().isIn(['ADMIN', 'EMPLOYEE']).withMessage('Rol debe ser ADMIN o EMPLOYEE'),
    body('employeeType').optional().isIn(['FIJO', 'TEMPORAL']).withMessage('Tipo de empleado debe ser FIJO o TEMPORAL'),
    body('monthlySalary').optional().isFloat({ min: 0 }).withMessage('Salario mensual debe ser >= 0'),
    body('monthlyHours').optional().isFloat({ min: 1 }).withMessage('Horas mensuales deben ser >= 1'),
    body('scheduledEntryTime').optional().matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Hora programada debe ser en formato HH:MM'),
    body('scheduleType').optional().isIn(['FULL_TIME','FLEXIBLE','SPECIFIC_DAYS']),
    body('scheduleBlocks').optional().isArray({ min: 1 }),
  ],
  userController.update
);

// DELETE /api/users/:id  (soft delete)
router.delete('/:id', userController.remove);

module.exports = router;
