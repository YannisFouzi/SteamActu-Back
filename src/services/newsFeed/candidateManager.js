/**
 * Gestionnaire des candidats pour le fil d'actualités
 */

const GameSubscription = require("../../models/GameSubscription");
const steamService = require("../steamService");

/**
 * Crée un gestionnaire de candidats
 * @returns {Object} - Gestionnaire avec Map et fonction d'ajout
 */
function createCandidateManager() {
  const candidateMap = new Map();

  const pushCandidate = (appId, name, source) => {
    if (!appId) return;

    const normalizedId = appId.toString();
    if (!candidateMap.has(normalizedId)) {
      candidateMap.set(normalizedId, {
        appId: normalizedId,
        name: name || `Jeu ${normalizedId}`,
        source,
      });
    }
  };

  return { candidateMap, pushCandidate };
}

/**
 * Ajoute les candidats des jeux récemment actifs
 * @param {Object} user - Utilisateur
 * @param {Function} pushCandidate - Fonction d'ajout
 * @param {number} cutoffTimestamp - Timestamp de coupure
 */
function addRecentGamesCandidates(user, pushCandidate, cutoffTimestamp) {
  if (!user?.recentActiveGames?.length) return;

  const recentStored = user.recentActiveGames
    .filter((item) => {
      if (!item?.appId || !item?.lastNewsDate) return false;

      const timestamp = new Date(item.lastNewsDate).getTime();
      return !Number.isNaN(timestamp) && timestamp >= cutoffTimestamp;
    })
    .sort(
      (a, b) =>
        new Date(b.lastNewsDate).getTime() - new Date(a.lastNewsDate).getTime()
    );

  recentStored.forEach((item) =>
    pushCandidate(item.appId, item.name, "recent-cache")
  );
}

/**
 * Ajoute les candidats des GameSubscriptions
 * @param {Function} pushCandidate - Fonction d'ajout
 * @param {boolean} followedOnly - Si seuls les jeux suivis doivent être inclus
 * @param {Set} followedSet - Set des jeux suivis par l'utilisateur
 */
async function addSubscriptionCandidates(
  pushCandidate,
  followedOnly,
  followedSet
) {
  let subscriptions;

  if (followedOnly) {
    if (followedSet.size === 0) return false; // Indique qu'il n'y a rien à traiter

    subscriptions = await GameSubscription.find({
      gameId: { $in: Array.from(followedSet) },
    })
      .sort({ updatedAt: -1 })
      .lean();
  } else {
    subscriptions = await GameSubscription.find({}).lean();
  }

  subscriptions.forEach((sub) => {
    if (sub?.gameId) {
      pushCandidate(sub.gameId, sub.name, "subscription");
    }
  });

  return true; // Indique que le traitement peut continuer
}

/**
 * Ajoute les candidats de la bibliothèque Steam de l'utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @param {Function} pushCandidate - Fonction d'ajout
 * @param {Map} candidateMap - Map des candidats existants
 */
async function addLibraryCandidates(steamId, pushCandidate, candidateMap) {
  if (candidateMap.size > 0 || !steamId) return;

  try {
    const userLibrary = await steamService.getUserGames(steamId);

    if (!Array.isArray(userLibrary) || userLibrary.length === 0) return;

    const libraryCandidates = userLibrary
      .map((game) => ({
        appId: game.appid ? game.appid.toString() : game.appId?.toString(),
        name: game.name,
        playtime: game.playtime_forever || 0,
        lastPlayed: game.rtime_last_played || 0,
      }))
      .filter((game) => game.appId)
      .sort((a, b) => {
        const aLast = a.lastPlayed || 0;
        const bLast = b.lastPlayed || 0;
        if (bLast !== aLast) return bLast - aLast;
        return (b.playtime || 0) - (a.playtime || 0);
      });

    libraryCandidates.forEach((game) => {
      pushCandidate(game.appId, game.name, "library");
    });
  } catch (error) {
    console.error(
      "Failed to extend news feed from user library:",
      error.message
    );
  }
}

module.exports = {
  createCandidateManager,
  addRecentGamesCandidates,
  addSubscriptionCandidates,
  addLibraryCandidates,
};
