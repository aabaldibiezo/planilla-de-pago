const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('../controllers/worksite.controller');
const {
  authenticate,
  requireAdmin,
  blockUntilPasswordChanged,
  requireCompanyContext,
  enforceCompanyStatus,
} = require('../middleware/auth');

const router = Router();

// Solo el administrador gestiona sedes. Las coordenadas y los radios no deben
// llegar nunca al dispositivo de un empleado.
router.use(
  authenticate,
  blockUntilPasswordChanged,
  requireCompanyContext,
  enforceCompanyStatus,
  requireAdmin
);

// --------------- Sedes ---------------

router.get('/', [query('includeInactive').optional().isBoolean()], controller.list);

router.post(
  '/',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('El nombre de la sede es requerido')
      .isLength({ max: 150 }),
    body('address')
      .trim()
      .notEmpty()
      .withMessage('La dirección es requerida')
      .isLength({ max: 300 }),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitud inválida'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitud inválida'),
    body('radiusMeters')
      .optional()
      .isInt({ min: 20, max: 20000 })
      .withMessage('El radio debe estar entre 20 y 20000 metros'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 1000 }),
  ],
  controller.create
);

router.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().isLength({ max: 150 }),
    body('address').optional().trim().notEmpty().isLength({ max: 300 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('radiusMeters').optional().isInt({ min: 20, max: 20000 }),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 1000 }),
    body('isActive').optional().isBoolean(),
  ],
  controller.update
);

router.delete('/:id', [param('id').isInt({ min: 1 })], controller.remove);

// --------------- Asignaciones de empleados ---------------

// Empleados que hoy no podrían marcar por no tener sede vigente.
router.get('/assignments/missing-today', controller.employeesWithoutWorksiteToday);

// Cruces de horario que ya existen en los datos. La validación solo frena
// altas nuevas; esto muestra lo que quedó de antes, sin corregir nada.
router.get('/assignments/conflicts', controller.assignmentConflicts);

router.get(
  '/assignments/list',
  [query('userId').optional().isInt({ min: 1 }), query('worksiteId').optional().isInt({ min: 1 })],
  controller.listAssignments
);

router.post(
  '/assignments',
  [
    body('userId').isInt({ min: 1 }).withMessage('Empleado requerido'),
    body('worksiteId').isInt({ min: 1 }).withMessage('Sede requerida'),
    body('dayOfWeek').optional({ nullable: true }).isInt({ min: 0, max: 6 }),
    body('specificDate').optional({ nullable: true }).isISO8601(),
    body('startTime')
      .optional({ nullable: true })
      .matches(/^([01]\d|2[0-3]):[0-5]\d$/),
    body('endTime')
      .optional({ nullable: true })
      .matches(/^([01]\d|2[0-3]):[0-5]\d$/),
    body('validFrom').optional({ nullable: true }).isISO8601(),
    body('validUntil').optional({ nullable: true }).isISO8601(),
  ],
  controller.createAssignment
);

router.delete('/assignments/:id', [param('id').isInt({ min: 1 })], controller.removeAssignment);

module.exports = router;
