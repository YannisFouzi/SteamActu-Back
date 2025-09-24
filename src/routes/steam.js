const express = require("express");
const router = express.Router();
const steamService = require("../services/steamService");
const User = require("../models/User");
const { validateSteamId } = require("../middleware/steamValidators");
const {
  formatGame,
  getLastUpdateTimestamp,
} = require("../services/steam/gameFormatter");
const { processAllGames } = require("../services/steam/gameProcessor");

// Récupérer les jeux d'un utilisateur Steam
router.get("/games/:steamId", validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;
    const { followedOnly } = req.query;
    console.log(
      `Requête getUserGames pour steamId: ${steamId}, followedOnly: ${followedOnly}`
    );

    // Récupérer l'utilisateur pour obtenir les informations sur les jeux suivis
    const user = await User.findOne({ steamId });

    // Récupérer les jeux
    let games = await steamService.getUserGames(steamId);

    // Si followedOnly est demandé, filtrer pour ne garder que les jeux suivis
    if (
      followedOnly === "true" &&
      user &&
      user.followedGames &&
      user.followedGames.length > 0
    ) {
      const followedAppIds = user.followedGames;
      games = games.filter((game) =>
        followedAppIds.includes(game.appid.toString())
      );
    }

    // Traiter tous les jeux par batches
    const allProcessedGames = await processAllGames(games, user);

    // Formater tous les jeux avec fallback sur le cache
    const formattedGames = games.map((game) => {
      const appId = game.appid.toString();

      // Chercher dans les jeux traités
      const processedGame = allProcessedGames.find(
        (g) => g.appId === appId || g.appid === appId
      );
      if (processedGame) {
        return processedGame;
      }

      // Fallback: formater avec timestamp du cache/utilisateur
      const lastUpdateTimestamp = getLastUpdateTimestamp(appId, user);
      return formatGame(game, lastUpdateTimestamp);
    });

    res.json(formattedGames);
  } catch (error) {
    console.error("Erreur dans /games/:steamId:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Récupérer le profil d'un utilisateur Steam
router.get("/profile/:steamId", validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    // Récupérer le profil
    const profile = await steamService.getUserProfile(steamId);

    if (!profile) {
      return res.status(404).json({ message: "Profil Steam non trouvé" });
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
