const { Router } = require('express');
const { body, param, query } = require('express-validator');
const attendanceController = require('../controllers/attendance.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

// GET /api/attendance
router.get('/', [query('userId').optional().isInt({ min: 1 }), query('month').optional().isInt({ min: 1, max: 12 }), query('year').optional().isInt({ min: 2020, max: 2100 })], attendanceController.getAll);
router.use(requireAdmin);

// POST /api/attendance (upsert)
router.post(
  '/',
  [
    body('userId').isInt().withMessage('ID de empleado requerido'),
    body('date').isISO8601().withMessage('Fecha requerida (ISO 8601)'),
    body('actualEntry').matches(/^([01]\d|2[0-3]):([0-5]\d)$/).withMessage('Hora de entrada real requerida en formato HH:MM'),
    body('notes').optional().isString(),
  ],
  attendanceController.upsert
);
router.post('/sessions/clock-in',[body('userId').isInt({min:1}),body('notes').optional().trim().isLength({max:500})],attendanceController.clockInSession);
router.patch('/sessions/:id/clock-out',[param('id').isInt({min:1})],attendanceController.clockOutSession);
router.patch('/sessions/:id/justification',[param('id').isInt({min:1}),body('status').isIn(['JUSTIFIED','REJECTED']),body('reason').trim().notEmpty(),body('notes').optional().trim().isLength({max:1000})],attendanceController.justifySession);

module.exports = router;
