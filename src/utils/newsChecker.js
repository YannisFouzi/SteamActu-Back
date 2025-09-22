const User = require("../models/User");
const steamService = require("../services/steamService");
const notificationService = require("../services/notificationService");

/**
 * Vérifie les nouvelles actualités pour tous les utilisateurs (VERSION OPTIMISÉE)
 * Récupère les news une seule fois par jeu, même si plusieurs utilisateurs le suivent
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function checkNewsForAllUsers() {
  try {
    // Récupérer tous les utilisateurs avec notifications activées
    const users = await User.find({
      "notificationSettings.enabled": true,
      "notificationSettings.pushToken": { $exists: true, $ne: null },
    });

    if (users.length === 0) {
      console.log("Aucun utilisateur avec notifications activées");
      return 0;
    }

    console.log(
      `Vérification optimisée des actualités pour ${users.length} utilisateurs`
    );

    // ÉTAPE 1: Collecter tous les jeux suivis par tous les utilisateurs
    const gameSubscriptions = new Map(); // appId -> {gameInfo, subscribers: [users]}

    users.forEach((user) => {
      if (user.followedGames && user.followedGames.length > 0) {
        user.followedGames.forEach((game) => {
          const appId = game.appId;

          if (!gameSubscriptions.has(appId)) {
            gameSubscriptions.set(appId, {
              gameInfo: game,
              subscribers: [],
            });
          }

          gameSubscriptions.get(appId).subscribers.push({
            user: user,
            gameData: game,
          });
        });
      }
    });

    const uniqueGamesCount = gameSubscriptions.size;
    const totalSubscriptions = Array.from(gameSubscriptions.values()).reduce(
      (sum, game) => sum + game.subscribers.length,
      0
    );

    console.log(
      `${uniqueGamesCount} jeux uniques suivis (${totalSubscriptions} abonnements au total)`
    );

    // ÉTAPE 2: Vérifier les actualités pour chaque jeu unique
    let totalNotifications = 0;
    let processedGames = 0;

    for (const [appId, gameData] of gameSubscriptions) {
      try {
        processedGames++;
        console.log(
          `[${processedGames}/${uniqueGamesCount}] Vérification des actualités pour ${gameData.gameInfo.name} (${gameData.subscribers.length} abonnés)`
        );

        // Récupérer les actualités du jeu (UNE SEULE FOIS)
        const news = await steamService.getGameNews(appId, 5);

        if (!news || news.length === 0) {
          continue;
        }

        // ÉTAPE 3: Distribuer les nouvelles actualités à tous les abonnés
        for (const subscription of gameData.subscribers) {
          const { user, gameData: userGameData } = subscription;

          // Filtrer pour ne garder que les nouvelles actualités pour cet utilisateur
          const newNews = news.filter((item) => {
            const newsDate = item.date;
            return newsDate > userGameData.lastNewsTimestamp;
          });

          if (newNews.length > 0) {
            // Mettre à jour le timestamp de la dernière actualité
            userGameData.lastNewsTimestamp = Math.max(
              ...newNews.map((item) => item.date)
            );

            // Mettre à jour également le timestamp de dernière mise à jour
            userGameData.lastUpdateTimestamp = Date.now();

            // Envoyer les notifications à cet utilisateur
            const notificationCount =
              await notificationService.sendNewsNotifications(user, {
                [appId]: newNews,
              });

            totalNotifications += notificationCount;

            // Sauvegarder les timestamps mis à jour pour cet utilisateur
            user.lastChecked = new Date();
            await user.save();

            if (notificationCount > 0) {
              console.log(
                `  → ${notificationCount} notification(s) envoyée(s) à ${user.username}`
              );
            }
          }
        }
      } catch (error) {
        console.error(
          `Erreur lors du traitement du jeu ${appId}:`,
          error.message
        );
      }
    }

    console.log(
      `✅ Vérification terminée: ${totalNotifications} notifications envoyées au total`
    );
    console.log(
      `📊 Optimisation: ${processedGames} requêtes API au lieu de ${totalSubscriptions} (économie de ${
        totalSubscriptions - processedGames
      } requêtes)`
    );

    return totalNotifications;
  } catch (error) {
    console.error("Erreur lors de la vérification des actualités:", error);
    return 0;
  }
}

/**
 * Vérifie les nouvelles actualités pour un utilisateur spécifique
 * @param {Object} user - Utilisateur pour lequel vérifier les actualités
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function checkNewsForUser(user) {
  try {
    // Si l'utilisateur n'a pas de jeux suivis, pas besoin de continuer
    if (!user.followedGames || user.followedGames.length === 0) {
      return 0;
    }

    const newsBatch = {};

    // Pour chaque jeu suivi
    for (const game of user.followedGames) {
      try {
        // Récupérer les actualités du jeu
        const news = await steamService.getGameNews(game.appId, 5);

        // Filtrer pour ne garder que les nouvelles actualités
        const newNews = news.filter((item) => {
          const newsDate = item.date;
          return newsDate > game.lastNewsTimestamp;
        });

        if (newNews.length > 0) {
          // Mettre à jour le timestamp de la dernière actualité
          game.lastNewsTimestamp = Math.max(
            ...newNews.map((item) => item.date)
          );

          // Mettre à jour également le timestamp de dernière mise à jour
          game.lastUpdateTimestamp = Date.now();

          // Ajouter les nouvelles actualités au batch
          newsBatch[game.appId] = newNews;
        }
      } catch (error) {}
    }

    // Si des nouvelles actualités ont été trouvées
    if (Object.keys(newsBatch).length > 0) {
      // Envoyer les notifications
      const notificationCount = await notificationService.sendNewsNotifications(
        user,
        newsBatch
      );

      // Sauvegarder les timestamps mis à jour
      user.lastChecked = new Date();
      await user.save();

      console.log(
        `${notificationCount} notifications envoyées à l'utilisateur ${user.username}`
      );
      return notificationCount;
    }

    return 0;
  } catch (error) {
    console.error(
      `Erreur lors de la vérification des actualités pour l'utilisateur ${user.steamId}:`,
      error
    );
    return 0;
  }
}

module.exports = {
  checkNewsForAllUsers,
  checkNewsForUser,
};
