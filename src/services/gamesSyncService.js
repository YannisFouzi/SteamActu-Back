const User = require("../models/User");
const { syncUserGames } = require("./gameSync/userProcessor");
const {
  createStats,
  updateStats,
  createUserGroup,
} = require("./gameSync/statsManager");

/**
 * Synchronise les jeux de tous les utilisateurs enregistrés
 * @returns {Promise<Object>} Statistiques de synchronisation
 */
async function syncAllUsersGames() {
  console.log(
    "Démarrage de la synchronisation automatique des bibliothèques..."
  );
  const stats = createStats();

  try {
    // Récupérer tous les utilisateurs
    const users = await User.find({});
    stats.totalUsers = users.length;
    console.log(`Synchronisation des jeux pour ${users.length} utilisateurs`);

    // Pour chaque utilisateur
    for (const user of users) {
      try {
        const result = await syncUserGames(user);
        updateStats(stats, result);
      } catch (error) {
        console.error(
          `Erreur lors de la synchronisation des jeux pour l'utilisateur ${user.username}:`,
          error
        );
        stats.errors++;
      }
    }

    console.log("Synchronisation automatique terminée:", stats);
    return stats;
  } catch (error) {
    console.error(
      "Erreur lors de la synchronisation automatique des jeux:",
      error
    );
    throw error;
  }
}

/**
 * Synchronise un groupe spécifique d'utilisateurs basé sur un index de groupe
 * Cette méthode permet de répartir la charge en synchronisant différents groupes d'utilisateurs à différents moments
 * @param {number} groupIndex - Index du groupe à synchroniser (0-basé)
 * @param {number} totalGroups - Nombre total de groupes
 * @returns {Promise<Object>} Statistiques de synchronisation pour ce groupe
 */
async function syncUserGroupByIndex(groupIndex, totalGroups) {
  console.log(
    `Synchronisation du groupe ${groupIndex + 1}/${totalGroups} d'utilisateurs`
  );

  const stats = createStats({ groupIndex, totalGroups });

  try {
    // Récupérer tous les utilisateurs
    const allUsers = await User.find({});
    stats.totalUsers = allUsers.length;

    // Si aucun utilisateur, retourner immédiatement
    if (allUsers.length === 0) {
      console.log("Aucun utilisateur trouvé, rien à synchroniser.");
      return stats;
    }

    // Créer le groupe d'utilisateurs
    const { groupUsers, startIndex, endIndex } = createUserGroup(
      allUsers,
      groupIndex,
      totalGroups
    );

    console.log(
      `Traitement de ${groupUsers.length} utilisateurs du groupe ${
        groupIndex + 1
      }/${totalGroups} (index ${startIndex}-${endIndex - 1})`
    );

    // Synchroniser chaque utilisateur du groupe
    for (const user of groupUsers) {
      try {
        const result = await syncUserGames(user);
        updateStats(stats, result);
      } catch (error) {
        console.error(
          `Erreur lors de la synchronisation de l'utilisateur ${user.username}:`,
          error
        );
        stats.errors++;
      }
    }

    console.log(
      `Synchronisation du groupe ${groupIndex + 1}/${totalGroups} terminée:`,
      stats
    );
    return stats;
  } catch (error) {
    console.error(
      `Erreur lors de la synchronisation du groupe ${
        groupIndex + 1
      }/${totalGroups}:`,
      error
    );
    stats.errors++;
    return stats;
  }
}

module.exports = {
  syncAllUsersGames,
  syncUserGames,
  syncUserGroupByIndex,
};
