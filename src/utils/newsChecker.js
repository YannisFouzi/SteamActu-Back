const User = require("../models/User");
const steamService = require("../services/steamService");
const notificationService = require("../services/notificationService");

/**
 * Vérifie les nouvelles actualités pour tous les utilisateurs
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function checkNewsForAllUsers() {
  try {
    // Récupérer tous les utilisateurs avec notifications activées
    const users = await User.find({
      "notificationSettings.enabled": true,
      "notificationSettings.pushToken": { $exists: true, $ne: null },
    });

    console.log(
      `Vérification des actualités pour ${users.length} utilisateurs`
    );

    let totalNotifications = 0;

    // Pour chaque utilisateur
    for (const user of users) {
      const notificationCount = await checkNewsForUser(user);
      totalNotifications += notificationCount;
    }

    console.log(`Total de ${totalNotifications} notifications envoyées`);
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
      } catch (error) {
        console.error(
          `Erreur lors de la récupération des actualités pour ${game.appId}:`,
          error
        );
      }
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
