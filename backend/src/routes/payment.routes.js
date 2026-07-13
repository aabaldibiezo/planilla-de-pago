const { Router } = require('express');
const { body, param, query } = require('express-validator');
const paymentController = require('../controllers/payment.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = Router();

router.use(authenticate);

// Employees can consult only their own history (enforced by the controller).
router.get('/history', [query('userId').optional().isInt({ min: 1 }), query('month').optional().isInt({ min: 1, max: 12 }), query('year').optional().isInt({ min: 2020, max: 2100 })], paymentController.getHistory);
router.use(requireAdmin);

// GET /api/payments/calculate
router.get('/calculate', [query('month').isInt({ min: 1, max: 12 }), query('year').isInt({ min: 2020, max: 2100 })], paymentController.calculate);

// POST /api/payments/pay
router.post(
  '/pay',
  [
    body('userId').isInt().withMessage('ID de empleado requerido'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Mes válido requerido (1-12)'),
    body('year').isInt({ min: 2020 }).withMessage('Año válido requerido'),
  ],
  paymentController.pay
);

// GET /api/payments/history
router.get('/monthly-report', [query('month').isInt({ min: 1, max: 12 }), query('year').isInt({ min: 2020, max: 2100 })], paymentController.monthlyReport);

// GET /api/payments/:id/pdf
router.get('/:id/pdf', [param('id').isInt({ min: 1 })], paymentController.getPdf);

module.exports = router;
