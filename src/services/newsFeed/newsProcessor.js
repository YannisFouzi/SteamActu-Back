/**
 * Processeur des actualités pour le fil d'actualités
 */

const steamService = require('../steamService');
const { extractFirstImage } = require('./imageExtractor');
const { extractSummary } = require('./summaryExtractor');
const logger = require('../../utils/logger');

// Cap la concurrence des appels Steam par requête /api/news/feed :
// - trop bas -> latence cumulée sur les gros followings
// - trop haut -> pics de 429 côté Steam et explosion du rate-limit quotidien
// 10 est un compromis validé sur les observations Railway (p95 16 s séquentiel
// -> ~max(timeout) en parallèle).
const STEAM_NEWS_CONCURRENCY = 10;

/**
 * Applique `mapper` sur `items` avec une limite de `concurrency` tâches
 * en vol simultanément. Ne rejette jamais : c'est au mapper de capturer
 * ses propres erreurs (on conserve la sémantique "erreur par jeu = skip").
 */
async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(concurrency, items.length);

  const runWorker = async () => {
    let current = cursor++;
    while (current < items.length) {
      results[current] = await mapper(items[current], current);
      current = cursor++;
    }
  };

  const workers = Array.from({ length: workerCount }, runWorker);
  await Promise.all(workers);
  return results;
}

/**
 * Traite les actualités pour une liste de jeux
 * @param {Array} gamesToProcess - Liste des jeux à traiter
 * @param {Set} followedSet - Set des jeux suivis
 * @param {Object} options - Options de traitement
 * @returns {Object} - Résultat du traitement
 */
async function processNewsForGames(gamesToProcess, followedSet, options = {}) {
  const { perGameLimit = 3, language = 'fr' } = options;

  const perGameResults = await mapWithConcurrency(
    gamesToProcess,
    STEAM_NEWS_CONCURRENCY,
    async (game) => {
      try {
        const newsItems = await steamService.getGameNews(
          game.appId,
          perGameLimit,
          undefined, // Utilise la valeur par défaut (5000)
          language
        );

        if (!Array.isArray(newsItems) || newsItems.length === 0) {
          return null;
        }

        let latestDate = 0;
        const items = newsItems.map((item) => {
          const newsDate = item.date * 1000;
          if (newsDate > latestDate) {
            latestDate = newsDate;
          }
          return {
            appId: game.appId,
            gameName: game.name,
            gameLogoUrl: game.imageUrl || null,
            isFollowed: followedSet.has(game.appId),
            news: {
              id: item.gid,
              title: item.title,
              url: item.url,
              author: item.author,
              date: newsDate,
              firstImageUrl: extractFirstImage(item.contents),
              // Derived first-sentence excerpt (Steam has no summary field). Used
              // by the web/plugin card; the mobile app ignores it.
              summary: extractSummary(item.contents),
              feedLabel: item.feedlabel,
            },
          };
        });

        return { appId: game.appId, items, latestDate };
      } catch (error) {
        logger.error(`Failed to fetch news for ${game.appId}:`, error.message);
        return null;
      }
    }
  );

  const feedItems = [];
  const latestNewsByGame = new Map();

  for (const result of perGameResults) {
    if (!result) {
      continue;
    }
    feedItems.push(...result.items);
    if (result.latestDate > 0) {
      latestNewsByGame.set(result.appId, result.latestDate);
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
