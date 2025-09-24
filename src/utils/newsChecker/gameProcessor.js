/**
 * Processeur des actualités de jeux
 * Gère la récupération et le filtrage des actualités
 */

const steamService = require("../../services/steamService");

/**
 * Récupère et filtre les nouvelles actualités d'un jeu
 * @param {string} gameId - ID du jeu
 * @param {number} lastNewsTimestamp - Timestamp de la dernière actualité connue
 * @returns {Promise<Object>} - Résultat avec nouvelles actualités et timestamp
 */
async function processGameNews(gameId, lastNewsTimestamp) {
  try {
    // Récupérer les actualités du jeu
    const news = await steamService.getGameNews(gameId, 5);

    if (!news || news.length === 0) {
      return { newNews: [], latestTimestamp: lastNewsTimestamp };
    }

    // Filtrer les nouvelles actualités (depuis le dernier check)
    const newNews = news.filter((item) => item.date > lastNewsTimestamp);

    if (newNews.length === 0) {
      return { newNews: [], latestTimestamp: lastNewsTimestamp };
    }

    // Calculer le nouveau timestamp
    const latestTimestamp = Math.max(...newNews.map((item) => item.date));

    return { newNews, latestTimestamp };
  } catch (error) {
    console.error(
      `Erreur lors du traitement des actualités pour ${gameId}:`,
      error.message
    );
    return { newNews: [], latestTimestamp: lastNewsTimestamp };
  }
}

/**
 * Met à jour le timestamp de dernière actualité d'une GameSubscription
 * @param {Object} gameSubscription - GameSubscription à mettre à jour
 * @param {number} latestTimestamp - Nouveau timestamp
 */
async function updateGameSubscriptionTimestamp(
  gameSubscription,
  latestTimestamp
) {
  try {
    gameSubscription.lastNewsTimestamp = latestTimestamp;
    await gameSubscription.save();
  } catch (error) {
    console.error(
      `Erreur mise à jour timestamp pour ${gameSubscription.gameId}:`,
      error.message
    );
  }
}

module.exports = {
  processGameNews,
  updateGameSubscriptionTimestamp,
};
