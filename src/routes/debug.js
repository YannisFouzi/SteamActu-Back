const express = require('express');
const router = express.Router();
const { sendNewsNotification } = require('../services/notifications/notificationService');
const { syncUserWishlist } = require('../services/syncWishlistService');
const { isValidSteamId } = require('../middleware/steamValidators');
const GameSubscription = require('../models/GameSubscription');
const Game = require('../models/Game');

async function resolveGameName(appId) {
  const sub = await GameSubscription.findOne({ gameId: String(appId) })
    .select('name')
    .lean();
  if (sub?.name) return sub.name;
  const game = await Game.findOne({ appId: String(appId) }).select('name').lean();
  if (game?.name) return game.name;
  return `Jeu ${appId}`;
}

/**
 * POST /api/debug/simulate-news-notification
 *
 * Simule l'envoi d'une notification de news identique à celle du cron.
 * Permet de tester le bouton "Ne plus suivre" sans attendre une vraie news.
 *
 * Body: { steamId, appId, gameName? }
 */
router.post('/simulate-news-notification', async (req, res) => {
  const { steamId, appId, gameName } = req.body;

  if (!isValidSteamId(steamId)) {
    return res.status(400).json({ message: 'steamId invalide' });
  }

  if (!appId || isNaN(parseInt(appId, 10))) {
    return res.status(400).json({ message: 'appId invalide' });
  }

  const fakeNewsGid = `debug-${Date.now()}`;
  const resolvedGameName = gameName || (await resolveGameName(appId));

  const success = await sendNewsNotification(
    steamId,
    String(appId),
    resolvedGameName,
    '[DEBUG] Notification de test — bouton unfollow',
    `https://store.steampowered.com/app/${appId}`,
    fakeNewsGid,
    null
  );

  if (!success) {
    return res.status(422).json({
      message: 'Notification non envoyée (notifications désactivées, token manquant, ou user introuvable)',
    });
  }

  res.json({ message: 'Notification envoyée', steamId, appId: String(appId) });
});

/**
 * POST /api/debug/force-wishlist-sync
 *
 * Force la sync wishlist pour un seul utilisateur.
 * Reproduit exactement ce que le cron ferait.
 *
 * Body: { steamId }
 */
router.post('/force-wishlist-sync', async (req, res) => {
  const { steamId } = req.body;

  if (!isValidSteamId(steamId)) {
    return res.status(400).json({ message: 'steamId invalide' });
  }

  console.log(`\n[DEBUG] === FORCE WISHLIST SYNC pour ${steamId} ===`);

  try {
    const result = await syncUserWishlist(steamId);
    console.log('[DEBUG] Résultat sync:', JSON.stringify(result, null, 2));
    res.json({ message: 'Sync terminée', result });
  } catch (error) {
    console.error('[DEBUG] Erreur sync wishlist:', error.message);
    res.status(500).json({ message: 'Erreur sync', error: error.message });
  }
});

module.exports = router;
