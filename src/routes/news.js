const express = require('express');
const router = express.Router();
const User = require('../models/User');
const newsFeedService = require('../services/newsFeedService');
const steamService = require('../services/steamService');
const { normalizeAppLanguage } = require('../utils/language');
const { isValidAppId, isValidSteamId, clampQueryInt } = require('../middleware/steamValidators');
const { mobileSessionAuth } = require('../middleware/mobileSessionAuth');
const requireSelf = require('../middleware/requireSelf');
const logger = require('../utils/logger');

router.get('/game/:appId', async (req, res) => {
  try {
    const {appId} = req.params;

    if (!isValidAppId(appId)) {
      return res.status(400).json({message: 'AppID invalide'});
    }

    const {count, maxLength, language, steamOnly} = req.query;

    const news = await steamService.getGameNews(
      appId,
      clampQueryInt(count, 5, 1, 100),
      clampQueryInt(maxLength, 300, 0, 5000),
      normalizeAppLanguage(language),
      steamOnly === 'false' ? false : true,
    );

    res.json(news);
  } catch (error) {
    res.status(500).json({message: 'Erreur serveur'});
  }
});

router.get('/feed', mobileSessionAuth, requireSelf, async (req, res) => {
  try {
    const {steamId, limit, perGameLimit, language, favoritesOnly} = req.query;

    if (steamId && !isValidSteamId(steamId)) {
      return res.status(400).json({message: 'SteamID invalide'});
    }

    let resolvedLanguage = normalizeAppLanguage(language);

    if (!language && steamId) {
      const user = await User.findOne({steamId}).select('language').lean();
      resolvedLanguage = normalizeAppLanguage(user?.language);
    }

    const feed = await newsFeedService.getNewsFeed({
      steamId,
      limit: limit !== undefined ? clampQueryInt(limit, 20, 1, 200) : undefined,
      perGameLimit: perGameLimit !== undefined ? clampQueryInt(perGameLimit, 3, 1, 20) : undefined,
      language: resolvedLanguage,
      favoritesOnly:
        typeof favoritesOnly === 'string'
          ? favoritesOnly.toLowerCase() === 'true'
          : Boolean(favoritesOnly),
    });

    res.json(feed);
  } catch (error) {
    logger.error({ err: error }, "news_feed_failed");
    res.status(500).json({message: 'Erreur serveur'});
  }
});

module.exports = router;
