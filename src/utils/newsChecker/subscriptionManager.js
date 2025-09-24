/**
 * Gestionnaire des abonnements aux jeux
 * Gère les GameSubscriptions et le nettoyage
 */

const GameSubscription = require("../../models/GameSubscription");

/**
 * Récupère tous les abonnements aux jeux
 * @returns {Promise<Array>} - Liste des GameSubscriptions
 */
async function getAllGameSubscriptions() {
  try {
    return await GameSubscription.find({});
  } catch (error) {
    console.error("Erreur récupération GameSubscriptions:", error.message);
    return [];
  }
}

/**
 * Calcule les statistiques des abonnements
 * @param {Array} gameSubscriptions - Liste des GameSubscriptions
 * @returns {Object} - Statistiques calculées
 */
function calculateSubscriptionStats(gameSubscriptions) {
  let totalSubscribers = 0;

  gameSubscriptions.forEach((game) => {
    totalSubscribers += game.subscribers.length;
  });

  return {
    totalGames: gameSubscriptions.length,
    totalSubscribers,
  };
}

/**
 * Nettoie les GameSubscriptions orphelines (sans abonnés)
 * @returns {Promise<number>} - Nombre de GameSubscriptions supprimées
 */
async function cleanupOrphanedSubscriptions() {
  try {
    const result = await GameSubscription.deleteMany({
      $or: [{ subscribers: { $size: 0 } }, { subscribers: { $exists: false } }],
    });

    if (result.deletedCount > 0) {
      console.log(
        `🧹 Nettoyage: ${result.deletedCount} GameSubscriptions orphelines supprimées`
      );
    }

    return result.deletedCount;
  } catch (error) {
    console.error("❌ Erreur lors du nettoyage:", error.message);
    return 0;
  }
}

/**
 * Trouve une GameSubscription par gameId
 * @param {string} gameId - ID du jeu
 * @returns {Promise<Object|null>} - GameSubscription ou null
 */
async function findGameSubscription(gameId) {
  try {
    return await GameSubscription.findOne({ gameId });
  } catch (error) {
    console.error(
      `Erreur recherche GameSubscription ${gameId}:`,
      error.message
    );
    return null;
  }
}

module.exports = {
  getAllGameSubscriptions,
  calculateSubscriptionStats,
  cleanupOrphanedSubscriptions,
  findGameSubscription,
};
