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

/**
 * Divise les utilisateurs en groupes
 * @param {Array} users - Liste des utilisateurs
 * @param {number} groupIndex - Index du groupe
 * @param {number} totalGroups - Nombre total de groupes
 * @returns {Object} - Informations sur le groupe
 */
function createUserGroup(users, groupIndex, totalGroups) {
  if (users.length === 0) {
    return { groupUsers: [], startIndex: 0, endIndex: 0 };
  }

  const groupSize = Math.ceil(users.length / totalGroups);
  const startIndex = groupIndex * groupSize;
  const endIndex = Math.min(startIndex + groupSize, users.length);
  const groupUsers = users.slice(startIndex, endIndex);

  return { groupUsers, startIndex, endIndex };
}

module.exports = {
  createStats,
  updateStats,
  createUserGroup,
};
