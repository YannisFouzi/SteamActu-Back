/**
 * Processeur des actualités pour le fil d'actualités
 */

const steamService = require('../steamService');
const { getGameLogoUrl, extractFirstImage } = require('./imageExtractor');

/**
 * Traite les actualités pour une liste de jeux
 * @param {Array} gamesToProcess - Liste des jeux à traiter
 * @param {Set} followedSet - Set des jeux suivis
 * @param {Object} options - Options de traitement
 * @returns {Object} - Résultat du traitement
 */
async function processNewsForGames(gamesToProcess, followedSet, options = {}) {
  const { perGameLimit = 3, language = 'fr' } = options;

  const feedItems = [];
  const latestNewsByGame = new Map();

  for (const game of gamesToProcess) {
    try {
      const newsItems = await steamService.getGameNews(
        game.appId,
        perGameLimit,
        undefined, // Utilise la valeur par défaut (5000)
        language
      );

      if (!Array.isArray(newsItems) || newsItems.length === 0) {
        continue;
      }

      newsItems.forEach((item) => {
        const newsDate = item.date * 1000;

        feedItems.push({
          appId: game.appId,
          gameName: game.name,
          gameLogoUrl: getGameLogoUrl(game.appId),
          isFollowed: followedSet.has(game.appId),
          news: {
            id: item.gid,
            title: item.title,
            url: item.url,
            author: item.author,
            date: newsDate,
            contents: item.contents,
            firstImageUrl: extractFirstImage(item.contents),
            feedLabel: item.feedlabel,
          },
        });

        // Suivre la date de la dernière actualité par jeu
        const currentLatest = latestNewsByGame.get(game.appId) || 0;
        if (newsDate > currentLatest) {
          latestNewsByGame.set(game.appId, newsDate);
        }
      });
    } catch (error) {
      console.error(`Failed to fetch news for ${game.appId}:`, error.message);
    }
  }

  return { feedItems, latestNewsByGame };
}

/**
 * Trie les actualités par date décroissante
 * @param {Array} feedItems - Actualités à traiter
 * @returns {Object} - Actualités triées
 */
function filterAndSortNews(feedItems = []) {
  const timeline = [...feedItems].sort(
    (a, b) => (b.news?.date || 0) - (a.news?.date || 0)
  );

  return { timeline, recentItems: timeline };
}

module.exports = {
  processNewsForGames,
  filterAndSortNews,
};
