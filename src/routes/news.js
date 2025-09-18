const express = require("express");
const router = express.Router();
const steamService = require("../services/steamService");

// Récupérer les actualités pour un jeu spécifique
router.get("/game/:appId", async (req, res) => {
  try {
    const { appId } = req.params;
    const { count, maxLength, language, steamOnly } = req.query;

    const news = await steamService.getGameNews(
      appId,
      count ? parseInt(count) : 5,
      maxLength ? parseInt(maxLength) : 300,
      language || "fr",
      steamOnly === "false" ? false : true // Convertit la chaîne en booléen
    );

    res.json(news);
  } catch (error) {
    console.error("Erreur lors de la récupération des actualités:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
