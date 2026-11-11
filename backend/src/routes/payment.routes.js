const { Router } = require('express');
const { body, param, query } = require('express-validator');
const paymentController = require('../controllers/payment.controller');
const {
  authenticate,
  requireAdmin,
  blockUntilPasswordChanged,
  requireCompanyContext,
  enforceCompanyStatus,
} = require('../middleware/auth');

const router = Router();

router.use(authenticate, blockUntilPasswordChanged, requireCompanyContext, enforceCompanyStatus);

// --------------- Rutas accesibles a cualquier usuario autenticado ---------------
//
// Nota sobre el orden: las rutas con segmentos estáticos (`/history`,
// `/calculate`, `/preview`, etc.) DEBEN ir ANTES de las rutas con parámetro
// dinámico (`/:id/pdf`, `/:id/receipt`). De lo contrario Express interpreta
// "calculate" como un `:id`, el validador `isInt` falla y el usuario recibe
// un 400 en lugar de llegar a la ruta correcta.

// Employees can consult only their own history (enforced by the controller).
router.get(
  '/history',
  [
    query('userId').optional().isInt({ min: 1 }),
    query('month').optional().isInt({ min: 1, max: 12 }),
    query('year').optional().isInt({ min: 2020, max: 2100 }),
  ],
  paymentController.getHistory
);

// Rutas con parámetro dinámico que necesitan ser accesibles a todos los usuarios.
// El controlador verifica internamente la pertenencia del pago al usuario.
router.get('/:id/pdf', [param('id').isInt({ min: 1 })], paymentController.getPdf);
router.get('/:id/receipt', [param('id').isInt({ min: 1 })], paymentController.getReceipt);

// --------------- Rutas exclusivas de administrador ---------------

router.use(requireAdmin);

// Rutas con segmentos estáticos primero, antes de las que usan `:id`.
// GET /api/payments/calculate
router.get(
  '/calculate',
  [query('month').isInt({ min: 1, max: 12 }), query('year').isInt({ min: 2020, max: 2100 })],
  paymentController.calculate
);

// GET /api/payments/preview — boleta en PDF sin registrar el pago
router.get(
  '/preview',
  [
    query('userId').isInt({ min: 1 }).withMessage('Empleado requerido'),
    query('month').isInt({ min: 1, max: 12 }),
    query('year').isInt({ min: 2020, max: 2100 }),
  ],
  paymentController.previewReceipt
);

// GET /api/payments/monthly-report
router.get(
  '/monthly-report',
  [query('month').isInt({ min: 1, max: 12 }), query('year').isInt({ min: 2020, max: 2100 })],
  paymentController.monthlyReport
);

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

// --------------- Recibo físico firmado ---------------
//
// Respaldo visual del papel que el empleado firmó al cobrar. El monto NO se
// lee de la imagen: sigue saliendo del cálculo de nómina.

router.post(
  '/:id/receipt',
  [
    param('id').isInt({ min: 1 }),
    body('photo').notEmpty().withMessage('La foto del recibo es obligatoria'),
  ],
  paymentController.uploadReceipt
);

router.delete('/:id/receipt', [param('id').isInt({ min: 1 })], paymentController.deleteReceipt);

module.exports = router;
