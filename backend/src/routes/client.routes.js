const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('../controllers/client.controller');
const {
  authenticate,
  requireAdmin,
  blockUntilPasswordChanged,
  enforceCompanyStatus,
} = require('../middleware/auth');

const router = Router();

// Misma cadena que el resto de las rutas de negocio. `enforceCompanyStatus`
// deja pasar las lecturas y bloquea las escrituras si la suscripción venció,
// sin necesidad de distinguirlas acá: lo hace por método HTTP.
router.use(authenticate, blockUntilPasswordChanged, enforceCompanyStatus, requireAdmin);

const MODALIDADES = ['ANTICIPADO', 'POSTERIOR'];

// --------------- Clientes ---------------

router.get(
  '/',
  [
    query('includeInactive').optional().isBoolean(),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2020, max: 2100 }),
  ],
  controller.list
);

router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('El nombre del cliente es requerido').isLength({ max: 150 }),
    body('taxId').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('contactName').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('contactPhone').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('contactEmail').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Correo inválido'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 1000 }),
  ],
  controller.create
);

// Antes de `/:id`: si no, Express tomaría "collections" como un id.
router.get('/collections/pending', controller.pendingCollections);
// Contratos que vencen en las próximas 2 semanas (o vencidos sin renovar).
router.get('/contracts/expiring', controller.expiringContracts);

router.get('/:id', [param('id').isInt({ min: 1 })], controller.getById);

router.put(
  '/:id',
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().isLength({ max: 150 }),
    body('taxId').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('contactName').optional({ nullable: true }).trim().isLength({ max: 150 }),
    body('contactPhone').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('contactEmail').optional({ nullable: true, checkFalsy: true }).isEmail(),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 1000 }),
    body('isActive').optional().isBoolean(),
  ],
  controller.update
);

router.delete('/:id', [param('id').isInt({ min: 1 })], controller.remove);

// --------------- Contratos ---------------

router.post(
  '/:id/contracts',
  [
    param('id').isInt({ min: 1 }),
    body('name').trim().notEmpty().withMessage('El nombre del contrato es requerido').isLength({ max: 150 }),
    body('reference').optional({ nullable: true }).trim().isLength({ max: 100 }),
    body('paymentTerms').isIn(MODALIDADES).withMessage('La modalidad debe ser ANTICIPADO o POSTERIOR'),
    body('startDate').optional({ nullable: true }).isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('billingDay').optional().isInt({ min: 1, max: 31 }).withMessage('El día de cobro va de 1 a 31'),
    body('worksiteId').optional({ nullable: true }).isInt({ min: 1 }),
    // Monto inicial opcional: se puede cargar el contrato y ponerle precio
    // después, cuando esté cerrado.
    body('amount').optional({ nullable: true }).isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a cero'),
    body('validFrom').optional({ nullable: true }).isISO8601(),
  ],
  controller.createContract
);

router.put(
  '/contracts/:id',
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().isLength({ max: 150 }),
    body('reference').optional({ nullable: true }).trim().isLength({ max: 100 }),
    body('paymentTerms').optional().isIn(MODALIDADES),
    body('startDate').optional({ nullable: true }).isISO8601(),
    body('endDate').optional({ nullable: true }).isISO8601(),
    body('billingDay').optional().isInt({ min: 1, max: 31 }).withMessage('El día de cobro va de 1 a 31'),
    body('worksiteId').optional({ nullable: true }).isInt({ min: 1 }),
    body('isActive').optional().isBoolean(),
  ],
  controller.updateContract
);

// --------------- Cobros ---------------

router.post(
  '/contracts/:id/collections',
  [
    param('id').isInt({ min: 1 }),
    body('month').isInt({ min: 1, max: 12 }),
    body('year').isInt({ min: 2020, max: 2100 }),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 500 }),
  ],
  controller.collect
);

router.delete(
  '/contracts/:id/collections/:year/:month',
  [
    param('id').isInt({ min: 1 }),
    param('year').isInt({ min: 2020, max: 2100 }),
    param('month').isInt({ min: 1, max: 12 }),
  ],
  controller.undoCollection
);

// --------------- Montos ---------------

router.get('/contracts/:id/rates', [param('id').isInt({ min: 1 })], controller.rateHistory);

router.post(
  '/contracts/:id/rates',
  [
    param('id').isInt({ min: 1 }),
    body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a cero'),
    body('validFrom').isISO8601().withMessage('Indique desde cuándo rige el monto'),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 500 }),
  ],
  controller.addRate
);

router.get(
  '/contracts/:id/rate',
  [
    param('id').isInt({ min: 1 }),
    query('month').isInt({ min: 1, max: 12 }),
    query('year').isInt({ min: 2020, max: 2100 }),
  ],
  controller.rateForPeriod
);

module.exports = router;
