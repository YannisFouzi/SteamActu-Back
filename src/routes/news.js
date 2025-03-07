const express = require("express");
const router = express.Router();
const steamService = require("../services/steamService");

// Récupérer les actualités pour un jeu spécifique
router.get("/game/:appId", async (req, res) => {
  try {
    const { appId } = req.params;
    const { count, maxLength } = req.query;

    const news = await steamService.getGameNews(
      appId,
      count ? parseInt(count) : 5,
      maxLength ? parseInt(maxLength) : 300
    );

    res.json(news);
  } catch (error) {
    console.error("Erreur lors de la récupération des actualités:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Récupérer les actualités pour plusieurs jeux
router.post("/batch", async (req, res) => {
  try {
    const { appIds, count, maxLength } = req.body;

    if (!Array.isArray(appIds)) {
      return res.status(400).json({ message: "appIds doit être un tableau" });
    }

    const newsCount = count ? parseInt(count) : 3;
    const newsMaxLength = maxLength ? parseInt(maxLength) : 300;

    // Récupérer les actualités pour chaque jeu en parallèle
    const newsPromises = appIds.map((appId) =>
      steamService
        .getGameNews(appId, newsCount, newsMaxLength)
        .then((news) => ({ appId, news }))
        .catch((error) => {
          console.error(`Erreur pour l'appId ${appId}:`, error);
          return { appId, news: [] };
        })
    );

    const results = await Promise.all(newsPromises);

    // Transforme le résultat en objet avec appId comme clé
    const newsMap = results.reduce((acc, item) => {
      acc[item.appId] = item.news;
      return acc;
    }, {});

    res.json(newsMap);
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des actualités batch:",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
