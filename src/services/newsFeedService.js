const {
  getUserAndFollowedGames,
  optimizeCandidates,
  updateUserActiveGames,
} = require("./newsFeed/userManager");
const {
  createCandidateManager,
  addRecentGamesCandidates,
  addSubscriptionCandidates,
  addLibraryCandidates,
} = require("./newsFeed/candidateManager");
const {
  processNewsForGames,
  filterAndSortNews,
} = require("./newsFeed/newsProcessor");

// Constantes
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Build a multi-game news feed combining Steam news for several titles.
 * @param {Object} options
 * @param {string} [options.steamId] - Current user's steamId to resolve follow state.
 * @param {boolean} [options.followedOnly=false] - Restrict to games followed by the user.
 * @param {number} [options.limit=20] - Maximum number of news items returned.
 * @param {number} [options.perGameLimit=3] - Max number of news pulled per game.
 * @param {string} [options.language='fr'] - Steam language param.
 * @returns {Promise<{items: Array, metadata: Object}>}
 */
async function getNewsFeed({
  steamId,
  followedOnly = false,
  limit = 20,
  perGameLimit = 3,
  language = "fr",
} = {}) {
  // Normaliser les paramètres
  const safeLimit = Math.max(200, Math.min(limit || 200, 200));
  const safePerGameLimit = Math.max(10, Math.min(perGameLimit || 10, 20));
  const now = Date.now();
  const cutoffTimestamp = now - RECENT_WINDOW_MS;

  // Récupérer l'utilisateur et ses jeux suivis
  const { user, followedSet } = await getUserAndFollowedGames(steamId);

  // Créer le gestionnaire de candidats
  const { candidateMap, pushCandidate } = createCandidateManager();

  // Ajouter les candidats des jeux récents (si pas en mode followedOnly)
  if (!followedOnly) {
    addRecentGamesCandidates(user, pushCandidate, cutoffTimestamp);
  }

  // Ajouter les candidats des GameSubscriptions
  const canContinue = await addSubscriptionCandidates(
    pushCandidate,
    followedOnly,
    followedSet
  );

  // Si followedOnly et pas de jeux suivis, retourner vide
  if (!canContinue) {
    return {
      items: [],
      metadata: {
        totalGamesQueried: 0,
        totalNewsRetrieved: 0,
        source: "followed",
      },
    };
  }

  // Ajouter les candidats de la bibliothèque Steam (fallback)
  if (!followedOnly) {
    await addLibraryCandidates(steamId, pushCandidate, candidateMap);
  }

  // Optimiser la liste des candidats
  let gamesToProcess = optimizeCandidates(
    candidateMap.values(),
    user,
    followedOnly,
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
        source: followedOnly ? "followed" : "all",
      },
    };
  }

  // Traiter les actualités pour tous les jeux
  const { feedItems, latestNewsByGame } = await processNewsForGames(
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
  if (!followedOnly && user) {
    await updateUserActiveGames(
      steamId,
      latestNewsByGame,
      candidateMap,
      cutoffTimestamp
    );
  }

  return {
    items: timeline,
    metadata: {
      totalGamesQueried: gamesToProcess.length,
      totalNewsRetrieved: feedItems.length,
      returnedCount: timeline.length,
      recentCount: recentItems.length,
      source: followedOnly ? "followed" : "all",
      steamId: steamId || null,
    },
  };
}
module.exports = {
  getNewsFeed,
};
