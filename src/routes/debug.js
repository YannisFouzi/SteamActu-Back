const express = require('express');
const router = express.Router();
const { sendNewsNotification } = require('../services/notifications/notificationService');
const { isValidSteamId } = require('../middleware/steamValidators');

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
  const resolvedGameName = gameName || `Test Game ${appId}`;

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

module.exports = router;
