const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('../controllers/statement.controller');
const {
  authenticate,
  requireAdmin,
  blockUntilPasswordChanged,
  enforceCompanyStatus,
} = require('../middleware/auth');

const router = Router();

// Misma cadena que el resto de las rutas de negocio. `enforceCompanyStatus`
// distingue lectura de escritura por método HTTP, así que con la suscripción
// vencida el estado se puede consultar pero no cargar gastos.
router.use(authenticate, blockUntilPasswordChanged, enforceCompanyStatus, requireAdmin);

const MES = { min: 1, max: 12 };
const ANIO = { min: 2020, max: 2100 };

// --------------- Estado ---------------

router.get(
  '/',
  [query('month').isInt(MES), query('year').isInt(ANIO)],
  controller.forMonth
);

router.get(
  '/history',
  [
    query('fromMonth').isInt(MES),
    query('fromYear').isInt(ANIO),
    query('toMonth').isInt(MES),
    query('toYear').isInt(ANIO),
  ],
  controller.history
);

// --------------- Categorías ---------------
//
// Van antes de `/entries/:id` por claridad, no por precedencia: los prefijos
// son distintos y no se pisan.

router.get(
  '/categories',
  [query('includeInactive').optional().isBoolean()],
  controller.listCategories
);

router.post(
  '/categories',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('El nombre de la categoría es requerido')
      .isLength({ max: 100 }),
    body('kind').optional().isIn(['OPERATING', 'FINANCIAL']),
    body('sortOrder').optional().isInt({ min: 0, max: 9999 }),
  ],
  controller.createCategory
);

// Repone las predefinidas que se hayan borrado. Va antes de `/categories/:id`
// para que "restore" no se interprete como un identificador.
router.post('/categories/restore', controller.restoreCategories);

router.put(
  '/categories/:id',
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    body('kind').optional().isIn(['OPERATING', 'FINANCIAL']),
    body('sortOrder').optional().isInt({ min: 0, max: 9999 }),
    body('isActive').optional().isBoolean(),
  ],
  controller.updateCategory
);

router.delete('/categories/:id', [param('id').isInt({ min: 1 })], controller.removeCategory);

// --------------- Movimientos ---------------

router.post(
  '/entries',
  [
    body('month').isInt(MES),
    body('year').isInt(ANIO),
    body('type').isIn(['OTHER_INCOME', 'EXPENSE']).withMessage('Tipo de movimiento inválido'),
    body('categoryId').optional({ nullable: true }).isInt({ min: 1 }),
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Escriba una descripción')
      .isLength({ max: 250 }),
    body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a cero'),
    body('occurredOn').optional({ nullable: true }).isISO8601(),
  ],
  controller.createEntry
);

router.put(
  '/entries/:id',
  [
    param('id').isInt({ min: 1 }),
    body('description').optional().trim().notEmpty().isLength({ max: 250 }),
    body('amount').optional().isFloat({ gt: 0 }),
    body('categoryId').optional({ nullable: true }).isInt({ min: 1 }),
    body('occurredOn').optional({ nullable: true }).isISO8601(),
  ],
  controller.updateEntry
);

router.delete('/entries/:id', [param('id').isInt({ min: 1 })], controller.removeEntry);

module.exports = router;
