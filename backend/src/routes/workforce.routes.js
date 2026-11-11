const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('../controllers/workforce.controller');
const {
  authenticate,
  requireAdmin,
  blockUntilPasswordChanged,
  requireCompanyContext,
  enforceCompanyStatus,
} = require('../middleware/auth');

const router = Router();
const time = /^([01]\d|2[0-3]):[0-5]\d$/;
const modes = [
  'SAME_RATE',
  'LOWER_RATE',
  'HIGHER_RATE',
  'MULTIPLIER',
  'FIXED_AMOUNT',
  'TIME_OFF',
  'UNPAID',
];
const workflow = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

router.use(
  authenticate,
  blockUntilPasswordChanged,
  requireCompanyContext,
  enforceCompanyStatus,
  requireAdmin
);
router.get(
  '/overtime',
  [query('userId').optional().isInt({ min: 1 }), query('status').optional().isIn(workflow)],
  controller.listOvertime
);
router.post(
  '/overtime',
  [
    body('userId').isInt({ min: 1 }).withMessage('Empleado requerido'),
    body('workDate').isISO8601().withMessage('Fecha válida requerida'),
    body('startTime').matches(time).withMessage('Hora inicial inválida'),
    body('endTime').matches(time).withMessage('Hora final inválida'),
    body('reason').trim().notEmpty().isLength({ max: 250 }),
    body('paymentMode').isIn(modes),
    body('multiplier').optional().isFloat({ gt: 0 }).withMessage('Multiplicador inválido'),
    body('fixedAmount')
      .optional({ nullable: true })
      .isFloat({ gt: 0 })
      .withMessage('Monto fijo inválido'),
    body('notes').optional().trim().isLength({ max: 1000 }),
  ],
  controller.createOvertime
);
router.put(
  '/overtime/:id',
  [
    param('id').isInt({ min: 1 }),
    body('userId').optional().isInt({ min: 1 }),
    body('workDate').optional().isISO8601(),
    body('startTime').optional().matches(time),
    body('endTime').optional().matches(time),
    body('reason').optional().trim().notEmpty().isLength({ max: 250 }),
    body('paymentMode').optional().isIn(modes),
    body('multiplier').optional().isFloat({ gt: 0 }),
    body('fixedAmount').optional({ nullable: true }).isFloat({ gt: 0 }),
    body('notes').optional().trim().isLength({ max: 1000 }),
  ],
  controller.updateOvertime
);
router.patch(
  '/overtime/:id/status',
  [param('id').isInt({ min: 1 }), body('status').isIn(['APPROVED', 'REJECTED'])],
  controller.approveOvertime
);
router.delete('/overtime/:id', [param('id').isInt({ min: 1 })], controller.removeOvertime);

router.get(
  '/discounts',
  [query('userId').optional().isInt({ min: 1 }), query('status').optional().isIn(workflow)],
  controller.listDiscounts
);
router.post(
  '/discounts',
  [
    body('userId').isInt({ min: 1 }).withMessage('Empleado requerido'),
    body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a cero'),
    body('discountDate').isISO8601().withMessage('Fecha válida requerida'),
    body('description')
      .trim()
      .notEmpty()
      .withMessage('Descripción requerida')
      .isLength({ max: 250 }),
    body('type')
      .isIn(['SALARY_ADVANCE', 'COMPANY_DAMAGE', 'LOAN', 'UNJUSTIFIED_ABSENCE', 'OTHER'])
      .withMessage('Tipo de descuento inválido'),
    body('notes').optional().trim().isLength({ max: 1000 }),
    body('documentReference').optional().trim().isLength({ max: 250 }),
  ],
  controller.createDiscount
);
router.patch(
  '/discounts/:id/status',
  [param('id').isInt({ min: 1 }), body('status').isIn(['APPROVED', 'REJECTED'])],
  controller.approveDiscount
);

router.get(
  '/compensations',
  [
    query('userId').optional().isInt({ min: 1 }),
    query('status').optional().isIn(['AVAILABLE', 'PARTIALLY_USED', 'USED', 'CANCELLED']),
  ],
  controller.listCompensations
);
router.post(
  '/compensations/:id/use',
  [
    param('id').isInt({ min: 1 }),
    body('hours').isFloat({ gt: 0 }),
    body('notes').optional().trim().isLength({ max: 1000 }),
  ],
  controller.useCompensation
);
router.get(
  '/audit',
  [
    query('actorId').optional().isInt({ min: 1 }),
    query('employeeId').optional().isInt({ min: 1 }),
    query('from').optional().isISO8601(),
    query('to').optional().isISO8601(),
    query('action').optional().trim().isLength({ max: 80 }),
    query('entity').optional().trim().isLength({ max: 80 }),
  ],
  controller.listAudit
);

module.exports = router;
