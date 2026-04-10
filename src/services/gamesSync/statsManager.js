/**
 * Gestionnaire des statistiques de synchronisation
 */

/**
 * Crée un objet de statistiques de base
 * @param {Object} options - Options supplémentaires
 * @returns {Object} - Objet de statistiques
 */
function createStats(options = {}) {
  return {
    totalUsers: 0,
    usersProcessed: 0,
    usersWithNewGames: 0,
    totalNewGames: 0,
    errors: 0,
    ...options,
  };
}

/**
 * Met à jour les statistiques avec le résultat d'un utilisateur
 * @param {Object} stats - Statistiques à mettre à jour
 * @param {Object} result - Résultat de synchronisation d'un utilisateur
 */
function updateStats(stats, result) {
  stats.usersProcessed++;

  if (result.updatedGames && result.updatedGames.length > 0) {
    stats.usersWithNewGames++;
    stats.totalNewGames += result.updatedGames.length;
  }

  if (result.error) {
    stats.errors++;
  }
}

module.exports = {
  createStats,
  updateStats,
};
