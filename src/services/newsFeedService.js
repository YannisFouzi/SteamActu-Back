const { getUserAndFollowedGames, optimizeCandidates } = require('./newsFeed/newsFeedUserManager');
const {
  createCandidateManager,
  addSubscriptionCandidates,
} = require('./newsFeed/candidateManager');
const {
  processNewsForGames,
  filterAndSortNews,
} = require('./newsFeed/newsProcessor');

// Fenêtre de fraicheur des actualités (source de vérité unique)
const NEWS_WINDOW_DAYS = 14;
const RECENT_WINDOW_MS = NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Build a multi-game news feed combining Steam news for several titles.
 * @param {Object} options
 * @param {string} [options.steamId] - Current user's steamId to resolve follow state.
 * @param {number} [options.limit=20] - Maximum number of news items returned.
 * @param {number} [options.perGameLimit=3] - Max number of news pulled per game.
 * @param {string} [options.language='fr'] - Steam language param.
 * @returns {Promise<{items: Array, metadata: Object}>}
 */
async function getNewsFeed({
  steamId,
  limit = 20,
  perGameLimit = 3,
  language = 'fr',
} = {}) {
  // Normaliser les paramètres
  const safeLimit = Math.max(200, Math.min(limit || 200, 200));
  const safePerGameLimit = Math.max(20, Math.min(perGameLimit || 20, 20));
  const now = Date.now();
  const cutoffTimestamp = now - RECENT_WINDOW_MS;

  // Récupérer l'utilisateur et ses jeux suivis
  const { user, followedSet } = await getUserAndFollowedGames(steamId);

  // Créer le gestionnaire de candidats
  const { candidateMap, pushCandidate } = createCandidateManager();

  // Ajouter les candidats des GameSubscriptions
  const canContinue = await addSubscriptionCandidates(
    pushCandidate,
    followedSet
  );

  // Aucun jeu suivi → rien à retourner
  if (!canContinue) {
    return {
      items: [],
      metadata: {
        totalGamesQueried: 0,
        totalNewsRetrieved: 0,
        source: 'followed',
      },
    };
  }

  // Optimiser la liste des candidats
  let gamesToProcess = optimizeCandidates(
    candidateMap.values(),
    user,
    safeLimit,
    safePerGameLimit
  );

  // Si aucun jeu à traiter, retourner vide
  if (gamesToProcess.length === 0) {
    return {
      items: [],
      metadata: {
        totalGamesQueried: 0,
        totalNewsRetrieved: 0,
        source: 'followed',
      },
    };
  }

  // Traiter les actualités pour tous les jeux
  const { feedItems } = await processNewsForGames(
    gamesToProcess,
    followedSet,
    { perGameLimit: safePerGameLimit, language }
  );

  // Filtrer et trier les actualités
  const { timeline, recentItems } = filterAndSortNews(
    feedItems,
    cutoffTimestamp
  );

  // Mettre à jour les jeux actifs de l'utilisateur
  return {
    items: timeline,
    metadata: {
      totalGamesQueried: gamesToProcess.length,
      totalNewsRetrieved: feedItems.length,
      returnedCount: timeline.length,
      recentCount: recentItems.length,
      source: 'followed',
      steamId: steamId || null,
    },
  };
}
module.exports = {
  getNewsFeed,
};
