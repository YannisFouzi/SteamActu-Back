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
    const { followedOnly, forceRefresh } = req.query;
    console.log(
      `Requête getUserGames pour steamId: ${steamId}, followedOnly: ${followedOnly}, forceRefresh: ${forceRefresh}`
    );

    // Récupérer l'utilisateur pour obtenir les informations sur les jeux suivis
    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    let games = [];
    let useCache = false;

    // Configuration : Age maximum du cache (24 heures)
    const CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24h en millisecondes

    // 🆕 STRATÉGIE CACHE AMÉLIORÉE : Vérifier fraîcheur + disponibilité
    const isCacheAvailable =
      user.gameLibrary &&
      user.gameLibrary.games &&
      user.gameLibrary.games.length > 0;

    const isCacheFresh =
      user.gameLibrary?.lastFullSync &&
      Date.now() - new Date(user.gameLibrary.lastFullSync).getTime() <
        CACHE_MAX_AGE;

    if (forceRefresh !== "true" && isCacheAvailable && isCacheFresh) {
      console.log(
        `📦 Utilisation du cache (${user.gameLibrary.games.length} jeux, dernière sync: ${user.gameLibrary.lastFullSync})`
      );

      // Convertir le cache au format attendu par le frontend (avec validation parseInt)
      games = user.gameLibrary.games
        .map((game) => {
          const appid = parseInt(game.appId, 10);
          if (isNaN(appid)) {
            console.warn(`⚠️ AppId invalide détecté : ${game.appId}`);
            return null;
          }
          return {
            appid,
            name: game.name,
            playtime_forever: game.playtime_forever || 0,
            playtime_2weeks: game.playtime_2weeks || 0,
            rtime_last_played: game.rtime_last_played || 0,
            img_icon_url: game.img_icon_url || "",
            // Ajouter les métadonnées du cache
            firstSeenDate: game.firstSeenDate,
            lastUpdateTimestamp: game.rtime_last_played || 0,
          };
        })
        .filter(Boolean); // Retirer les null (appIds invalides)

      useCache = true;
    } else {
      if (!isCacheAvailable) {
        console.log(`🔄 Cache indisponible, récupération depuis Steam API`);
      } else if (!isCacheFresh) {
        console.log(
          `🔄 Cache trop ancien (${Math.round(
            (Date.now() - new Date(user.gameLibrary.lastFullSync).getTime()) /
              (60 * 60 * 1000)
          )}h), récupération depuis Steam API`
        );
      } else {
        console.log(`🔄 ForceRefresh demandé, récupération depuis Steam API`);
      }

      // Récupérer les jeux depuis Steam API
      games = await steamService.getUserGames(steamId);
    }

    // Si followedOnly est demandé, filtrer pour ne garder que les jeux suivis
    if (
      followedOnly === "true" &&
      user.followedGames &&
      user.followedGames.length > 0
    ) {
      const followedAppIds = user.followedGames;
      games = games.filter((game) =>
        followedAppIds.includes(game.appid.toString())
      );
    }

    let formattedGames = [];

    // Si on utilise le cache, pas besoin de traiter
    if (useCache) {
      // Ajouter les infos de suivi
      formattedGames = games.map((game) => ({
        ...game,
        isFollowed: user.followedGames.includes(game.appid.toString()),
      }));
    } else {
      // Traiter tous les jeux par batches (comme avant)
      const allProcessedGames = await processAllGames(games, user);

      // Formater tous les jeux avec fallback sur le cache
      formattedGames = games.map((game) => {
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
    }

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

// Récupérer la wishlist d'un utilisateur Steam
router.get("/wishlist/:steamId", validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;
    console.log(`Requête getUserWishlist pour steamId: ${steamId}`);

    const wishlist = await steamService.getUserWishlist(steamId);

    res.json(wishlist);
  } catch (error) {
    console.error("Erreur dans /wishlist/:steamId:", error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
});

module.exports = router;
