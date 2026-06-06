/**
 * Routes admin consommees par l'application mobile.
 *
 * Contrairement a /admin, ces routes n'utilisent jamais le mot de passe UI ni
 * ADMIN_TOKEN. Elles exigent une session mobile signee, emise uniquement apres
 * un login Steam OpenID valide, puis verifient l'allowlist ADMIN_STEAM_IDS.
 */

const express = require('express');

const {
  isMobileAdminSession,
  mobileSessionAuth,
  requireMobileAdmin,
} = require('../middleware/mobileSessionAuth');
const statsService = require('../services/admin/statsService');

const router = express.Router();

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.use(mobileSessionAuth);

router.get('/access', (req, res) => {
  res.json({ isAdmin: isMobileAdminSession(req.mobileSession) });
});

router.use(requireMobileAdmin);

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

// Manual "refresh my account" (library + Steam Family + wishlist) for the admin.
// Runs the same per-user sync as the cron, on demand, for the session's own
// SteamID. Admin-gated by requireMobileAdmin above.
router.post(
  '/refresh-account',
  asyncHandler(async (req, res) => {
    // Lazy-require: keeps importing this route module light (the sync stack pulls
    // the Steam apiClient, which reads config at load time) — loaded on demand.
    const { refreshUserAccount } = require('../services/accountRefreshService');
    const result = await refreshUserAccount(req.mobileSession.steamId);
    res.status(result.ok ? 200 : 500).json(result);
  })
);

module.exports = router;
