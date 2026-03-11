/**
 * Gestionnaire des candidats pour le fil d'actualités
 */

const GameSubscription = require('../../models/GameSubscription');

/**
 * Crée un gestionnaire de candidats
 * @returns {Object} - Gestionnaire avec Map et fonction d'ajout
 */
function createCandidateManager() {
  const candidateMap = new Map();

  const pushCandidate = (appId, name, source, imageUrl) => {
    if (!appId) return;

    const normalizedId = appId.toString();
    if (!candidateMap.has(normalizedId)) {
      candidateMap.set(normalizedId, {
        appId: normalizedId,
        name: name || `Jeu ${normalizedId}`,
        source,
        imageUrl: imageUrl || null,
      });
    }
  };

  return { candidateMap, pushCandidate };
}

/**
 * Ajoute les candidats des GameSubscriptions
 * @param {Function} pushCandidate - Fonction d'ajout
 * @param {Set} followedSet - Set des jeux suivis par l'utilisateur
 */
async function addSubscriptionCandidates(pushCandidate, followedSet) {
  let subscriptions;

  if (followedSet.size === 0) return false; // Indique qu'il n'y a rien à traiter

  subscriptions = await GameSubscription.find({
    gameId: { $in: Array.from(followedSet) },
  })
    .sort({ updatedAt: -1 })
    .lean();

  subscriptions.forEach((sub) => {
    if (sub?.gameId) {
      pushCandidate(sub.gameId, sub.name, 'subscription', sub.imageUrl);
    }
  });

  return true; // Indique que le traitement peut continuer
}

module.exports = {
  createCandidateManager,
  addSubscriptionCandidates,
};
