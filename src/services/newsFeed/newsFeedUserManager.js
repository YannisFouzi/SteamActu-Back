/**
 * Gestionnaire des données utilisateur pour le fil d'actualités
 */

const User = require('../../models/User');

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
        if (typeof appId === 'string') {
          followedSet.add(appId);
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
 * @param {number} safeLimit - Limite sécurisée
 * @param {number} safePerGameLimit - Limite par jeu
 * @returns {Array} - Liste optimisée des jeux à traiter
 */
function optimizeCandidates(candidates, user, safeLimit, safePerGameLimit) {
  const games = Array.from(candidates);
  const maxCandidates = Math.max(safeLimit * 2, safePerGameLimit * 10, 100);

  const gamesToProcess = games
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

  return gamesToProcess;
}

module.exports = {
  getUserAndFollowedGames,
  optimizeCandidates,
};
