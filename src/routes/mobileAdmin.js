/**
 * Routes admin consommees par l'application mobile.
 *
 * Contrairement a /admin, ces routes n'utilisent jamais le mot de passe UI ni
 * ADMIN_TOKEN. Elles exigent une session mobile signee, emise uniquement apres
 * un login Steam OpenID valide, puis verifient l'allowlist ADMIN_STEAM_IDS.
 */

const express = require('express');

const {
  mobileSessionAuth,
  requireMobileAdmin,
} = require('../middleware/mobileSessionAuth');
const statsService = require('../services/admin/statsService');

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.use(mobileSessionAuth, requireMobileAdmin);

router.get('/access', (_req, res) => {
  res.json({ isAdmin: true });
});

router.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    const data = await statsService.getAllStats();
    res.json(data);
  })
);

router.get(
  '/stats/overview',
  asyncHandler(async (_req, res) => {
    const data = await statsService.getOverview();
    res.json(data);
  })
);

router.get(
  '/stats/polling',
  asyncHandler(async (_req, res) => {
    const data = await statsService.getPolling();
    res.json(data);
  })
);

router.get(
  '/stats/crons',
  asyncHandler(async (_req, res) => {
    const data = await statsService.getCrons();
    res.json(data);
  })
);

module.exports = router;
