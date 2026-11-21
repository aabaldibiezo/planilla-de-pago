const { Router } = require('express');
const { body, param, query } = require('express-validator');
const attendanceController = require('../controllers/attendance.controller');
const {
  authenticate,
  requireAdmin,
  blockUntilPasswordChanged,
  requireCompanyContext,
  enforceCompanyStatus,
} = require('../middleware/auth');

const router = Router();

// El límite de tamaño para la foto se define en `index.js`: el parser global
// corre antes que este router, así que debe resolverse allí.

router.use(authenticate, blockUntilPasswordChanged, requireCompanyContext, enforceCompanyStatus);

// GET /api/attendance
router.get(
  '/',
  [
    query('userId').optional().isInt({ min: 1 }),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2020, max: 2100 }),
  ],
  attendanceController.getAll
);

// --------------- Marcación propia (app móvil) ---------------
// Disponibles para cualquier usuario autenticado sobre sus propios registros.

router.get('/sessions/self/status', attendanceController.selfStatus);

// La ubicación pasa a ser obligatoria: con geocerco estricto, una marcación
// sin coordenadas no se puede validar y por lo tanto no se acepta.
router.post(
  '/sessions/self/clock-in',
  [
    body('photo').notEmpty().withMessage('La foto de la marcación es obligatoria'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Ubicación requerida'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Ubicación requerida'),
    body('accuracyMeters').optional({ nullable: true }).isFloat({ min: 0 }),
    body('deviceInfo').optional({ nullable: true }).isString().isLength({ max: 250 }),
  ],
  attendanceController.selfClockIn
);

// --------------- Encargado de sede: marca a su equipo desde la app ---------------
// El servicio verifica que quien llama sea encargado de sede y que la persona
// esté asignada hoy a su sede.

router.get('/team/today', attendanceController.teamToday);

router.post(
  '/team/clock-in',
  [
    body('userId').isInt({ min: 1 }).withMessage('Elija a la persona'),
    body('photo').notEmpty().withMessage('La foto de la persona es obligatoria'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Ubicación requerida'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Ubicación requerida'),
    body('accuracyMeters').optional({ nullable: true }).isFloat({ min: 0 }),
    body('deviceInfo').optional({ nullable: true }).isString().isLength({ max: 250 }),
  ],
  attendanceController.teamClockIn
);

router.patch(
  '/team/:id/clock-out',
  [
    param('id').isInt({ min: 1 }),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Ubicación requerida'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Ubicación requerida'),
    body('accuracyMeters').optional({ nullable: true }).isFloat({ min: 0 }),
    body('photo').optional({ nullable: true }).isString(),
  ],
  attendanceController.teamClockOut
);

router.patch(
  '/sessions/self/:id/clock-out',
  [
    param('id').isInt({ min: 1 }),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Ubicación requerida'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Ubicación requerida'),
    body('accuracyMeters').optional({ nullable: true }).isFloat({ min: 0 }),
    body('photo').optional({ nullable: true }).isString(),
  ],
  attendanceController.selfClockOut
);

router.use(requireAdmin);

// --------------- Registro manual ---------------
// Contrapartida del bloqueo estricto: permite registrar la jornada de alguien
// que no pudo marcar por falta de GPS o señal.
router.post(
  '/sessions/manual-clock-in',
  [
    body('userId').isInt({ min: 1 }).withMessage('Empleado requerido'),
    body('reason')
      .trim()
      .isLength({ min: 5, max: 500 })
      .withMessage('Indique el motivo del registro manual'),
  ],
  attendanceController.manualClockIn
);

// --------------- Día de un temporal ---------------
// El encargado carga entrada y salida juntas de quien vino a trabajar un día.
router.post(
  '/sessions/worked-day',
  [
    body('userId').isInt({ min: 1 }).withMessage('Elija a la persona'),
    body('date').isISO8601().withMessage('Fecha inválida'),
    body('worksiteId').isInt({ min: 1 }).withMessage('Elija la sede donde trabajó'),
    body('startTime')
      .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .withMessage('Hora de entrada inválida'),
    body('endTime')
      .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .withMessage('Hora de salida inválida'),
  ],
  attendanceController.registerWorkedDay
);

// --------------- Revisión de marcaciones sospechosas ---------------

router.get(
  '/sessions/review',
  [
    query('status').optional().isIn(['PENDING', 'APPROVED', 'REJECTED']),
    query('userId').optional().isInt({ min: 1 }),
  ],
  attendanceController.listForReview
);

router.patch(
  '/sessions/:id/review',
  [
    param('id').isInt({ min: 1 }),
    body('status').isIn(['APPROVED', 'REJECTED']),
    body('notes').optional().trim().isLength({ max: 1000 }),
  ],
  attendanceController.reviewSession
);

// POST /api/attendance (upsert)
router.post(
  '/',
  [
    body('userId').isInt().withMessage('ID de empleado requerido'),
    body('date').isISO8601().withMessage('Fecha requerida (ISO 8601)'),
    body('actualEntry')
      .matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .withMessage('Hora de entrada real requerida en formato HH:MM'),
    body('notes').optional().isString(),
  ],
  attendanceController.upsert
);
router.post(
  '/sessions/clock-in',
  [body('userId').isInt({ min: 1 }), body('notes').optional().trim().isLength({ max: 500 })],
  attendanceController.clockInSession
);
router.patch(
  '/sessions/:id/clock-out',
  [param('id').isInt({ min: 1 })],
  attendanceController.clockOutSession
);
router.patch(
  '/sessions/:id/justification',
  [
    param('id').isInt({ min: 1 }),
    body('status').isIn(['JUSTIFIED', 'REJECTED']),
    body('reason').trim().notEmpty(),
    body('notes').optional().trim().isLength({ max: 1000 }),
  ],
  attendanceController.justifySession
);

module.exports = router;
