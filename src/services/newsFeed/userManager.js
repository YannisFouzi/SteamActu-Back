/**
 * Gestionnaire des données utilisateur pour le fil d'actualités
 */

const User = require("../../models/User");

/**
 * Récupère et normalise les jeux suivis par un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object>} - Utilisateur et set des jeux suivis
 */
async function getUserAndFollowedGames(steamId) {
  const followedSet = new Set();
  let user = null;

  if (steamId) {
    user = await User.findOne({ steamId });

    if (user && Array.isArray(user.followedGames)) {
      user.followedGames.forEach((appId) => {
        if (typeof appId === "string") {
          // Nouvelle structure : juste l'appId
          followedSet.add(appId);
        } else if (appId && appId.appId) {
          // Ancienne structure : objet avec appId
          followedSet.add(appId.appId);
        }
      });
    }
  }

  return { user, followedSet };
}

/**
 * Traite et optimise la liste des candidats
 * @param {Array} candidates - Liste des candidats
 * @param {Object} user - Utilisateur
 * @param {boolean} followedOnly - Si seuls les jeux suivis doivent être inclus
 * @param {number} safeLimit - Limite sécurisée
 * @param {number} safePerGameLimit - Limite par jeu
 * @returns {Array} - Liste optimisée des jeux à traiter
 */
function optimizeCandidates(
  candidates,
  user,
  followedOnly,
  safeLimit,
  safePerGameLimit
) {
  let gamesToProcess = Array.from(candidates);

  if (!followedOnly) {
    const maxCandidates = Math.max(safeLimit * 2, safePerGameLimit * 10, 100);

    gamesToProcess = gamesToProcess
      .sort((a, b) => {
        const aStored = user?.recentActiveGames?.find(
          (item) => item.appId === a.appId
        );
        const bStored = user?.recentActiveGames?.find(
          (item) => item.appId === b.appId
        );
        const aDate = aStored ? new Date(aStored.lastNewsDate).getTime() : 0;
        const bDate = bStored ? new Date(bStored.lastNewsDate).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, maxCandidates);
  }

  return gamesToProcess;
}

/**
 * Met à jour les jeux récemment actifs de l'utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @param {Map} latestNewsByGame - Map des dernières actualités par jeu
 * @param {Map} candidateMap - Map des candidats
 * @param {number} cutoffTimestamp - Timestamp de coupure
 */
async function updateUserActiveGames(
  steamId,
  latestNewsByGame,
  candidateMap,
  cutoffTimestamp
) {
  if (!steamId) return;

  const activeGames = [];

  latestNewsByGame.forEach((timestamp, appId) => {
    if (timestamp >= cutoffTimestamp) {
      const candidate = candidateMap.get(appId);
      activeGames.push({
        appId,
        name: candidate?.name || `Jeu ${appId}`,
        lastNewsDate: new Date(timestamp),
      });
    }
  });

  activeGames.sort(
    (a, b) => new Date(b.lastNewsDate) - new Date(a.lastNewsDate)
  );

  const limitedActive = activeGames.slice(0, 200);

  try {
    await User.updateOne({ steamId }, { recentActiveGames: limitedActive });
  } catch (error) {
    console.error("Failed to store recentActiveGames for user", steamId, error);
  }
}

module.exports = {
  getUserAndFollowedGames,
  optimizeCandidates,
  updateUserActiveGames,
};
