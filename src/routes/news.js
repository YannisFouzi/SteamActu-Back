﻿const express = require("express");
const router = express.Router();
const steamService = require("../services/steamService");
const newsFeedService = require("../services/newsFeedService");

// Recuperer les actualites pour un jeu specifique
router.get("/game/:appId", async (req, res) => {
  try {
    const { appId } = req.params;
    const { count, maxLength, language, steamOnly } = req.query;

    const news = await steamService.getGameNews(
      appId,
      count ? parseInt(count) : 5,
      maxLength ? parseInt(maxLength) : 300,
      language || "fr",
      steamOnly === "false" ? false : true
    );

    res.json(news);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Recuperer un fil d'actualites global
router.get("/feed", async (req, res) => {
  try {
    const { steamId, followedOnly, limit, perGameLimit, language } = req.query;

    const feed = await newsFeedService.getNewsFeed({
      steamId,
      followedOnly: followedOnly === "true",
      limit: limit ? parseInt(limit, 10) : undefined,
      perGameLimit: perGameLimit ? parseInt(perGameLimit, 10) : undefined,
      language: language || "fr",
    });

    res.json(feed);
  } catch (error) {
    console.error(
      "Erreur lors de la recuperation du fil d'actualites:",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
