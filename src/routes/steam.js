const express = require("express");
const router = express.Router();
const steamService = require("../services/steamService");
const User = require("../models/User");

// Récupérer les jeux d'un utilisateur Steam
router.get("/games/:steamId", async (req, res) => {
  const requestId = Date.now();
  global.firstRequestDone = true;
  try {
    const { steamId } = req.params;
    const { followedOnly } = req.query; // Nouveau paramètre pour filtrer

    // Valider le SteamID
    if (!steamId || steamId.length < 10) {
      return res.status(400).json({ message: "SteamID invalide" });
    }

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
      const totalGamesCount = games.length;
      const followedAppIds = user.followedGames.map((g) => g.appId);
      games = games.filter((game) =>
        followedAppIds.includes(game.appid.toString())
      );
    }

    // Traitement des jeux en plusieurs lots pour éviter de surcharger l'API et améliorer les performances
    const BATCH_SIZE = 50; // Taille de chaque lot
    const batches = [];

    // Diviser les jeux en lots
    for (let i = 0; i < games.length; i += BATCH_SIZE) {
      batches.push(games.slice(i, i + BATCH_SIZE));
    }

    // Fonction pour traiter un lot de jeux
    const processGameBatch = async (gameBatch, batchIndex) => {
      const formattedGamesPromises = gameBatch.map(async (game) => {
        const appId = game.appid.toString();

        // Vérifier si ce jeu est dans la liste des jeux suivis pour récupérer lastUpdateTimestamp
        let lastUpdateTimestamp = 0;
        if (user && user.followedGames) {
          const followedGame = user.followedGames.find(
            (g) => g.appId === appId
          );
          if (followedGame && followedGame.lastUpdateTimestamp) {
            lastUpdateTimestamp = followedGame.lastUpdateTimestamp;
          }
        }

        // Récupérer les actualités récentes pour ce jeu
        try {
          const news = await steamService.getGameNews(appId, 1);
          if (news && news.length > 0) {
            // Utiliser la date de la dernière actualité comme timestamp
            const latestNewsDate = news[0].date * 1000; // Convertir de secondes en millisecondes
            if (latestNewsDate > 0) {
              lastUpdateTimestamp = latestNewsDate;
            }
          }
        } catch (error) {}

        return {
          appid: appId, // Utiliser appid (lowercase) pour compatibilité mobile
          appId, // Garder appId aussi pour compatibilité
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
          lastUpdateTimestamp,
        };
      });

      return Promise.all(formattedGamesPromises);
    };

    // Initialiser le cache global si nécessaire
    if (!global.gameNewsCache) {
      global.gameNewsCache = {};
    }

    // Traiter TOUS les lots avant d'envoyer la réponse
    const allProcessedGames = [];

    for (let i = 0; i < batches.length; i++) {
      const batchGames = await processGameBatch(batches[i], i);

      // Stocker tous les jeux traités
      allProcessedGames.push(...batchGames);

      // Mettre à jour le cache avec les nouveaux timestamps
      batchGames.forEach((game) => {
        if (game.lastUpdateTimestamp > 0) {
          global.gameNewsCache[game.appId] = {
            timestamp: game.lastUpdateTimestamp,
            updated: Date.now(),
          };
        }
      });

      // LOG B : Compter les timestamps dans le cache après chaque lot
      const cacheCount = Object.keys(global.gameNewsCache || {}).length;

      // Pause entre les lots pour éviter de surcharger l'API
      if (i < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // LOG C : Compter le cache final
    const finalCacheCount = Object.keys(global.gameNewsCache || {}).length;

    // Formater tous les jeux, en utilisant les données traitées
    const formattedGames = games.map((game) => {
      const appId = game.appid.toString();

      // Chercher dans tous les jeux traités
      const processedGame = allProcessedGames.find(
        (g) => g.appId === appId || g.appid === appId
      );
      if (processedGame) {
        return processedGame;
      }

      // Si pas trouvé dans les jeux traités, vérifier dans le cache global
      let lastUpdateTimestamp = 0;
      if (global.gameNewsCache && global.gameNewsCache[appId]) {
        lastUpdateTimestamp = global.gameNewsCache[appId].timestamp;
      } else if (user && user.followedGames) {
        const followedGame = user.followedGames.find((g) => g.appId === appId);
        if (followedGame && followedGame.lastUpdateTimestamp) {
          lastUpdateTimestamp = followedGame.lastUpdateTimestamp;
        }
      }

      return {
        appid: appId, // Utiliser appid (lowercase) pour compatibilité mobile
        appId, // Garder appId aussi pour compatibilité
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
        lastUpdateTimestamp,
      };
    });

    // LOG A : Compter les timestamps avant envoi
    const gamesWithTimestamp = formattedGames.filter(
      (game) => game.lastUpdateTimestamp > 0
    );

    res.json(formattedGames);

    // Log final pour débogage - après envoi de la réponse
  } catch (error) {
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
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
