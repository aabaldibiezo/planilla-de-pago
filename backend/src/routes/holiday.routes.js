const { Router } = require('express');
const { body, param, query } = require('express-validator');
const controller = require('../controllers/holiday.controller');
const {
  authenticate,
  requireAdmin,
  blockUntilPasswordChanged,
  enforceCompanyStatus,
} = require('../middleware/auth');

const router = Router();

router.use(authenticate, blockUntilPasswordChanged, enforceCompanyStatus, requireAdmin);

router.get('/', [query('year').isInt({ min: 2020, max: 2100 })], controller.forYear);

router.post(
  '/',
  [
    body('date').isISO8601().withMessage('Fecha inválida'),
    body('name').trim().isLength({ min: 2, max: 120 }).withMessage('Indique el nombre del feriado'),
  ],
  controller.create
);

router.delete('/:id', [param('id').isInt({ min: 1 })], controller.remove);

// Cuántos jornales se pagan por cada domingo de descanso o feriado trabajado.
router.put(
  '/extra-day-factor',
  [
    body('extraDayFactor')
      .isFloat({ min: 0, max: 5 })
      .withMessage('Indique cuántos jornales se pagan (entre 0 y 5)'),
  ],
  controller.setExtraDayFactor
);

module.exports = router;
