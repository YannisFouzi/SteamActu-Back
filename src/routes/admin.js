/**
 * Routes /admin — dashboard operationnel.
 *
 * Acces protege par `adminAuth` (Bearer token). Les erreurs async sont
 * propagees via `next(err)` pour que Sentry + l'errorHandler global les
 * capturent (Express 4 ne catch pas auto les rejections de middlewares async).
 *
 * Endpoints:
 *   GET /admin/stats            -> { overview, polling, crons, meta }
 *   GET /admin/stats/overview   -> overview seulement (polling de dashboard leger)
 *   GET /admin/stats/polling    -> repartition par tier
 *   GET /admin/stats/crons      -> etat des 3 jobs Agenda
 */

const express = require('express');
const router = express.Router();

const statsService = require('../services/admin/statsService');

/**
 * Wrapper pour les handlers async : route les rejects vers `next(err)`.
 * Equivalent minimaliste d'`express-async-errors` (pas de dependance ajoutee).
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const data = await statsService.getAllStats();
    res.json(data);
  })
);

router.get(
  '/stats/overview',
  asyncHandler(async (req, res) => {
    const data = await statsService.getOverview();
    res.json(data);
  })
);

router.get(
  '/stats/polling',
  asyncHandler(async (req, res) => {
    const data = await statsService.getPolling();
    res.json(data);
  })
);

router.get(
  '/stats/crons',
  asyncHandler(async (req, res) => {
    const data = await statsService.getCrons();
    res.json(data);
  })
);

module.exports = router;
