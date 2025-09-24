const steamService = require("../steamService");
const { formatGame, updateGameCache } = require("./gameFormatter");

/**
 * Processeur pour traiter les jeux Steam par batch
 */

const BATCH_SIZE = 50;
const BATCH_DELAY = 1000; // 1 seconde entre les batches

/**
 * Divise un array en batches de taille fixe
 * @param {Array} array - Array à diviser
 * @param {number} size - Taille de chaque batch
 * @returns {Array} - Array de batches
 */
function createBatches(array, size = BATCH_SIZE) {
  const batches = [];
  for (let i = 0; i < array.length; i += size) {
    batches.push(array.slice(i, i + size));
  }
  return batches;
}

/**
 * Traite un batch de jeux pour récupérer les actualités
 * @param {Array} gameBatch - Batch de jeux
 * @param {Object} user - Utilisateur (optionnel)
 * @returns {Promise<Array>} - Jeux formatés
 */
async function processGameBatch(gameBatch, user = null) {
  const formattedGamesPromises = gameBatch.map(async (game) => {
    const appId = game.appid.toString();
    let lastUpdateTimestamp = 0;

    // Vérifier si ce jeu est dans la liste des jeux suivis
    if (user && user.followedGames) {
      const followedGame = user.followedGames.find((g) => g.appId === appId);
      if (followedGame && followedGame.lastUpdateTimestamp) {
        lastUpdateTimestamp = followedGame.lastUpdateTimestamp;
      }
    }

    // Récupérer les actualités récentes pour ce jeu
    try {
      const news = await steamService.getGameNews(appId, 1);
      if (news && news.length > 0) {
        const latestNewsDate = news[0].date * 1000; // Convertir de secondes en millisecondes
        if (latestNewsDate > 0) {
          lastUpdateTimestamp = latestNewsDate;
        }
      }
    } catch (error) {
      // Ignorer les erreurs de récupération d'actualités
    }

    return formatGame(game, lastUpdateTimestamp);
  });

  return Promise.all(formattedGamesPromises);
}

/**
 * Traite tous les jeux par batches
 * @param {Array} games - Liste des jeux
 * @param {Object} user - Utilisateur (optionnel)
 * @returns {Promise<Array>} - Tous les jeux traités
 */
async function processAllGames(games, user = null) {
  const batches = createBatches(games);
  const allProcessedGames = [];

  for (let i = 0; i < batches.length; i++) {
    const batchGames = await processGameBatch(batches[i], user);
    allProcessedGames.push(...batchGames);

    // Mettre à jour le cache avec les nouveaux timestamps
    batchGames.forEach((game) => {
      updateGameCache(game.appId, game.lastUpdateTimestamp);
    });

    // Pause entre les lots pour éviter de surcharger l'API
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
    }
  }

  return allProcessedGames;
}

module.exports = {
  createBatches,
  processGameBatch,
  processAllGames,
  BATCH_SIZE,
};
