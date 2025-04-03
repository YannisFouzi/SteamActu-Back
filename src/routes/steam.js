const express = require("express");
const router = express.Router();
const steamService = require("../services/steamService");
const User = require("../models/User");

// Jeux populaires qui auront des timestamps manuels pour les tests
const TEST_GAMES_WITH_UPDATES = {
  730: { name: "Counter-Strike 2", timestamp: Date.now() - 3600000 }, // Mis à jour il y a 1 heure
  570: { name: "Dota 2", timestamp: Date.now() - 7200000 }, // Mis à jour il y a 2 heures
  440: { name: "Team Fortress 2", timestamp: Date.now() - 86400000 }, // Mis à jour il y a 24 heures
};

// Récupérer les jeux d'un utilisateur Steam
router.get("/games/:steamId", async (req, res) => {
  console.log(`Requête reçue pour le SteamID: ${req.params.steamId}`);
  try {
    const { steamId } = req.params;

    // Valider le SteamID
    if (!steamId || steamId.length < 10) {
      return res.status(400).json({ message: "SteamID invalide" });
    }

    // Récupérer l'utilisateur pour obtenir les informations sur les jeux suivis
    const user = await User.findOne({ steamId });

    // Récupérer les jeux
    const games = await steamService.getUserGames(steamId);

    // Identifiez Split Fiction et assurez-vous qu'il est traité en priorité
    const splitFictionIndex = games.findIndex(
      (game) => game.name === "Split Fiction"
    );
    if (splitFictionIndex !== -1 && splitFictionIndex >= 50) {
      console.log(
        "Split Fiction trouvé à l'index",
        splitFictionIndex,
        "- Traitement prioritaire"
      );
      const splitFiction = games[splitFictionIndex];
      // Déplacer Split Fiction dans les 50 premiers jeux pour s'assurer qu'il est traité
      games.splice(splitFictionIndex, 1);
      games.unshift(splitFiction);
    }

    // Traitement des jeux en plusieurs lots pour éviter de surcharger l'API et améliorer les performances
    const BATCH_SIZE = 50; // Taille de chaque lot
    const batches = [];

    // Diviser les jeux en lots
    for (let i = 0; i < games.length; i += BATCH_SIZE) {
      batches.push(games.slice(i, i + BATCH_SIZE));
    }

    console.log(
      `Traitement de ${games.length} jeux en ${batches.length} lots de ${BATCH_SIZE} jeux maximum`
    );

    // Fonction pour traiter un lot de jeux
    const processGameBatch = async (gameBatch, batchIndex) => {
      console.log(
        `Traitement du lot ${batchIndex + 1}/${batches.length} (${
          gameBatch.length
        } jeux)`
      );

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
              console.log(
                `Actualité trouvée pour ${game.name}: ${new Date(
                  lastUpdateTimestamp
                ).toLocaleString()}`
              );
            }
          }
        } catch (error) {
          console.error(
            `Erreur lors de la récupération des actualités pour ${appId}:`,
            error.message
          );
        }

        return {
          appId,
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

    // Traiter le premier lot immédiatement pour une réponse rapide
    const firstBatchGames = await processGameBatch(batches[0], 0);

    // Traiter le reste des lots en arrière-plan et les stocker en cache pour les prochaines requêtes
    if (batches.length > 1) {
      // On n'attend pas que ce traitement se termine pour renvoyer la réponse
      (async () => {
        try {
          console.log(
            "Lancement du traitement des lots restants en arrière-plan"
          );

          // Utiliser un objet global pour stocker les résultats (simple cache en mémoire)
          if (!global.gameNewsCache) {
            global.gameNewsCache = {};
          }

          // Traiter les lots restants
          for (let i = 1; i < batches.length; i++) {
            const batchGames = await processGameBatch(batches[i], i);

            // Stocker les résultats dans le cache
            batchGames.forEach((game) => {
              if (game.lastUpdateTimestamp > 0) {
                global.gameNewsCache[game.appId] = {
                  timestamp: game.lastUpdateTimestamp,
                  updated: Date.now(),
                };
              }
            });

            // Pause entre les lots pour éviter de surcharger l'API
            if (i < batches.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          }

          console.log(
            "Traitement de tous les lots terminé et cache mis à jour"
          );
        } catch (error) {
          console.error(
            "Erreur lors du traitement des lots en arrière-plan:",
            error
          );
        }
      })();
    }

    // Formater tous les jeux, en utilisant les données du cache si disponibles
    const formattedGames = games.map((game) => {
      const appId = game.appid.toString();

      // Chercher d'abord dans le premier lot déjà traité
      const processedGame = firstBatchGames.find((g) => g.appId === appId);
      if (processedGame) {
        return processedGame;
      }

      // Sinon, vérifier dans le cache global
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
        appId,
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

// Résoudre un nom d'utilisateur Steam en SteamID
router.get("/resolve-vanity/:vanityUrl", async (req, res) => {
  try {
    const { vanityUrl } = req.params;

    if (!vanityUrl || vanityUrl.trim() === "") {
      return res.status(400).json({ message: "Nom d'utilisateur invalide" });
    }

    const steamId = await steamService.resolveVanityURL(vanityUrl);

    if (!steamId) {
      return res
        .status(404)
        .json({ message: "Nom d'utilisateur Steam non trouvé" });
    }

    res.json({ steamId });
  } catch (error) {
    console.error("Erreur lors de la résolution du nom d'utilisateur:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Gérer le retour d'authentification Steam OpenID
router.get("/auth/steam/return", async (req, res) => {
  try {
    // Valider la réponse OpenID
    if (!req.query["openid.identity"]) {
      return res.status(400).json({ error: "Réponse OpenID invalide" });
    }

    // Récupérer le SteamID de la réponse OpenID
    const identity = req.query["openid.identity"];
    const matches = identity.match(/\/id\/(\d+)$/);

    if (!matches || !matches[1]) {
      return res
        .status(400)
        .json({ error: "SteamID non trouvé dans la réponse" });
    }

    const steamId = matches[1];

    // Enregistrer l'utilisateur s'il n'existe pas déjà
    try {
      await steamService.registerOrUpdateUser(steamId);
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de l'utilisateur:", error);
      // On continue même en cas d'erreur pour ne pas bloquer l'authentification
    }

    // Rediriger vers l'application mobile avec le SteamID
    // Note: Dans un cas réel, vous devriez utiliser un mécanisme plus sécurisé
    // comme un token JWT à durée limitée au lieu de passer directement le SteamID
    res.redirect(`steamnotif://auth?steamId=${steamId}`);
  } catch (error) {
    console.error("Erreur lors de l'authentification Steam:", error);
    res.status(500).json({ error: "Erreur lors de l'authentification" });
  }
});

module.exports = router;
