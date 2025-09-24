/**
 * Service de vérification des actualités Steam
 * Architecture optimisée utilisant GameSubscription pour minimiser les requêtes API
 */

const {
  getAllGameSubscriptions,
  calculateSubscriptionStats,
  cleanupOrphanedSubscriptions,
  findGameSubscription,
} = require("./newsChecker/subscriptionManager");
const {
  processGameNews,
  updateGameSubscriptionTimestamp,
} = require("./newsChecker/gameProcessor");
const {
  processGameSubscribers,
  sendNotificationsToUser,
} = require("./newsChecker/userProcessor");

/**
 * Vérifie les actualités pour tous les utilisateurs (méthode optimisée)
 * Utilise GameSubscription pour minimiser les requêtes API Steam
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function checkNewsForAllUsers() {
  try {
    console.log("🔍 Début de la vérification des actualités...");

    // Récupérer tous les jeux suivis
    const gameSubscriptions = await getAllGameSubscriptions();

    if (gameSubscriptions.length === 0) {
      console.log("📭 Aucun jeu suivi, aucune vérification nécessaire");
      return 0;
    }

    // Calculer les statistiques
    const stats = calculateSubscriptionStats(gameSubscriptions);
    console.log(
      `📊 ${stats.totalGames} jeux suivis, ${stats.totalSubscribers} abonnements totaux`
    );

    let totalNotifications = 0;
    let processedGames = 0;

    // Traiter chaque jeu (1 requête API par jeu)
    for (const gameSubscription of gameSubscriptions) {
      try {
        processedGames++;
        const { gameId, subscribers, lastNewsTimestamp } = gameSubscription;

        console.log(
          `🎮 [${processedGames}/${stats.totalGames}] Traitement du jeu ${gameId} (${subscribers.length} abonnés)`
        );

        // Récupérer et filtrer les nouvelles actualités
        const { newNews, latestTimestamp } = await processGameNews(
          gameId,
          lastNewsTimestamp
        );

        if (newNews.length === 0) {
          continue;
        }

        console.log(
          `📰 ${newNews.length} nouvelles actualités trouvées pour ${gameId}`
        );

        // Mettre à jour le timestamp
        await updateGameSubscriptionTimestamp(
          gameSubscription,
          latestTimestamp
        );

        // Distribuer les notifications à tous les abonnés
        const gameNotifications = await processGameSubscribers(
          subscribers,
          gameId,
          newNews
        );

        totalNotifications += gameNotifications;

        if (gameNotifications > 0) {
          console.log(
            `✅ ${gameNotifications} notifications envoyées pour ${gameId}`
          );
        }
      } catch (gameError) {
        console.error(
          `❌ Erreur pour le jeu ${gameSubscription.gameId}:`,
          gameError.message
        );
      }
    }

    console.log(
      `🎯 Vérification terminée: ${totalNotifications} notifications envoyées au total`
    );
    return totalNotifications;
  } catch (error) {
    console.error("💥 Erreur lors de la vérification des actualités:", error);
    return 0;
  }
}

/**
 * Vérifie les actualités pour un utilisateur spécifique (fonction de compatibilité)
 * @param {Object} user - Utilisateur pour lequel vérifier les actualités
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function checkNewsForUser(user) {
  try {
    if (!user.followedGames || user.followedGames.length === 0) {
      return 0;
    }

    let totalNotifications = 0;

    // Traiter chaque jeu suivi par cet utilisateur
    for (const gameId of user.followedGames) {
      try {
        // Trouver la GameSubscription correspondante
        const gameSubscription = await findGameSubscription(gameId);

        if (!gameSubscription) {
          continue;
        }

        // Traiter les actualités du jeu
        const { newNews, latestTimestamp } = await processGameNews(
          gameId,
          gameSubscription.lastNewsTimestamp
        );

        if (newNews.length === 0) {
          continue;
        }

        // Envoyer les notifications à cet utilisateur
        const notificationCount = await sendNotificationsToUser(
          user,
          gameId,
          newNews
        );
        totalNotifications += notificationCount;

        // Mettre à jour le timestamp de la GameSubscription
        await updateGameSubscriptionTimestamp(
          gameSubscription,
          latestTimestamp
        );
      } catch (error) {
        console.error(`Erreur pour le jeu ${gameId}:`, error.message);
      }
    }

    return totalNotifications;
  } catch (error) {
    console.error(
      `Erreur lors de la vérification pour ${user.steamId}:`,
      error.message
    );
    return 0;
  }
}

module.exports = {
  checkNewsForAllUsers,
  checkNewsForUser,
  cleanupOrphanedSubscriptions,
};
