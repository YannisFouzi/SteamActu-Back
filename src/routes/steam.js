const express = require("express");
const router = express.Router();
const steamService = require("../services/steamService");

// Récupérer les jeux d'un utilisateur Steam
router.get("/games/:steamId", async (req, res) => {
  console.log(`Requête reçue pour le SteamID: ${req.params.steamId}`);
  try {
    const { steamId } = req.params;

    // Valider le SteamID
    if (!steamId || steamId.length < 10) {
      return res.status(400).json({ message: "SteamID invalide" });
    }

    // Récupérer les jeux
    const games = await steamService.getUserGames(steamId);

    // Formater les données pour les rendre plus faciles à utiliser
    const formattedGames = games.map((game) => ({
      appId: game.appid.toString(),
      name: game.name,
      logoUrl: game.img_logo_url
        ? `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
        : null,
      iconUrl: game.img_icon_url
        ? `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
        : null,
      playtime: {
        forever: game.playtime_forever || 0,
        recent: game.playtime_2weeks || 0,
      },
    }));

    res.json(formattedGames);
  } catch (error) {
    console.error("Erreur lors de la récupération des jeux:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Récupérer le profil d'un utilisateur Steam
router.get("/profile/:steamId", async (req, res) => {
  try {
    const { steamId } = req.params;

    // Valider le SteamID
    if (!steamId || steamId.length < 10) {
      return res.status(400).json({ message: "SteamID invalide" });
    }

    // Récupérer le profil
    const profile = await steamService.getUserProfile(steamId);

    if (!profile) {
      return res.status(404).json({ message: "Profil Steam non trouvé" });
    }

    res.json(profile);
  } catch (error) {
    console.error("Erreur lors de la récupération du profil:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
