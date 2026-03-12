const express = require('express');
const router = express.Router();
const User = require('../models/User');
const newsFeedService = require('../services/newsFeedService');
const steamService = require('../services/steamService');
const { normalizeAppLanguage } = require('../utils/language');

router.get('/game/:appId', async (req, res) => {
  try {
    const {appId} = req.params;
    const {count, maxLength, language, steamOnly} = req.query;

    const news = await steamService.getGameNews(
      appId,
      count ? parseInt(count, 10) : 5,
      maxLength ? parseInt(maxLength, 10) : 300,
      normalizeAppLanguage(language),
      steamOnly === 'false' ? false : true,
    );

    res.json(news);
  } catch (error) {
    res.status(500).json({message: 'Erreur serveur'});
  }
});

router.get('/feed', async (req, res) => {
  try {
    const {steamId, limit, perGameLimit, language, favoritesOnly} = req.query;

    let resolvedLanguage = normalizeAppLanguage(language);

    if (!language && steamId) {
      const user = await User.findOne({steamId}).select('language').lean();
      resolvedLanguage = normalizeAppLanguage(user?.language);
    }

    const feed = await newsFeedService.getNewsFeed({
      steamId,
      limit: limit ? parseInt(limit, 10) : undefined,
      perGameLimit: perGameLimit ? parseInt(perGameLimit, 10) : undefined,
      language: resolvedLanguage,
      favoritesOnly:
        typeof favoritesOnly === 'string'
          ? favoritesOnly.toLowerCase() === 'true'
          : Boolean(favoritesOnly),
    });

    res.json(feed);
  } catch (error) {
    console.error("Erreur lors de la recuperation du fil d'actualites:", error);
    res.status(500).json({message: 'Erreur serveur'});
  }
});

module.exports = router;
