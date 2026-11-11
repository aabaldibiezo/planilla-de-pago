const { Router } = require('express');
const { body, param } = require('express-validator');
const controller = require('../controllers/platform.controller');
const {
  authenticate,
  requireSuperAdmin,
  blockUntilPasswordChanged,
} = require('../middleware/auth');

const router = Router();

/**
 * Administración de la plataforma. Exclusiva del SUPER_ADMIN.
 *
 * No lleva `requireCompanyContext` ni `enforceCompanyStatus`: son lo contrario
 * de esta sección. El súper administrador no pertenece a ninguna empresa y su
 * acceso no depende del estado de suscripción de nadie.
 *
 * Ninguna ruta de acá alcanza datos operativos (empleados, asistencia, nómina):
 * de cada empresa solo se ven plan, uso y cobros.
 */
router.use(authenticate, blockUntilPasswordChanged, requireSuperAdmin);

// --------------- Empresas clientes ---------------

router.get('/companies', controller.listCompanies);

router.get('/companies/:id', [param('id').isInt({ min: 1 })], controller.getCompany);

router.post(
  '/companies',
  [
    body('name').trim().notEmpty().withMessage('El nombre de la empresa es requerido').isLength({
      max: 150,
    }),
    body('contactEmail').isEmail().withMessage('Correo de contacto válido requerido'),
    body('contactPhone').optional({ nullable: true }).trim().isLength({ max: 30 }),
    body('taxId').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('planId').isInt({ min: 1 }).withMessage('Debe seleccionar un plan'),
    body('adminEmail').isEmail().withMessage('Correo del administrador válido requerido'),
    body('adminFirstName').trim().notEmpty().withMessage('Nombre del administrador requerido'),
    body('adminLastName').trim().notEmpty().withMessage('Apellido del administrador requerido'),
  ],
  controller.createCompany
);

router.patch(
  '/companies/:id/plan',
  [
    param('id').isInt({ min: 1 }),
    body('planId').isInt({ min: 1 }).withMessage('Debe seleccionar un plan'),
    body('reason').optional().trim().isLength({ max: 500 }),
  ],
  controller.changePlan
);

router.post(
  '/companies/:id/payments',
  [
    param('id').isInt({ min: 1 }),
    // El importe va en dólares: es la moneda de la suscripción, distinta de
    // los bolivianos con que la empresa liquida sus sueldos.
    body('amountUsd').isFloat({ gt: 0 }).withMessage('El importe en USD debe ser mayor a cero'),
    body('periodMonth').isInt({ min: 1, max: 12 }).withMessage('Mes cubierto inválido'),
    body('periodYear').isInt({ min: 2020, max: 2100 }).withMessage('Año cubierto inválido'),
    body('paidAt').optional({ nullable: true }).isISO8601(),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 1000 }),
  ],
  controller.registerPayment
);

// --------------- Planes ---------------

router.get('/plans', controller.listPlans);

router.put(
  '/plans/:id',
  [
    param('id').isInt({ min: 1 }),
    body('name').optional().trim().notEmpty().isLength({ max: 100 }),
    // null = ilimitado, para el plan Empresarial.
    body('maxEmployees').optional({ nullable: true }).isInt({ min: 1, max: 100000 }),
    body('monthlyPriceUsd').optional().isFloat({ min: 0 }),
  ],
  controller.updatePlan
);

// --------------- Súper administradores ---------------
// Alta exclusiva del SUPER_ADMIN: ningún otro rol ve ni ejecuta esta ruta.

router.get('/super-admins', controller.listSuperAdmins);

router.post(
  '/super-admins',
  [
    body('email').isEmail().withMessage('Correo válido requerido'),
    body('firstName').trim().notEmpty().withMessage('Nombre requerido'),
    body('lastName').trim().notEmpty().withMessage('Apellido requerido'),
  ],
  controller.createSuperAdmin
);

module.exports = router;
