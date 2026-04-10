const User = require('../../models/User');
const { CRON_CONFIG } = require('../../config/app');
const { isInBucket } = require('../../utils/userBucket');
const { syncUserGames } = require('./userProcessor');
const { createStats, updateStats } = require('./statsManager');
const { checkGamesVisibility } = require('../steam/visibilityCheck');

/**
 * Synchronise les jeux de tous les utilisateurs enregistrés
 * @returns {Promise<Object>} Statistiques de synchronisation
 */
async function syncAllUsersGames() {
  console.log('Démarrage de la synchronisation automatique des bibliothèques...');
  const stats = createStats();

  try {
    // Récupérer tous les utilisateurs
    const users = await User.find({});
    stats.totalUsers = users.length;
    console.log(`Synchronisation des jeux pour ${users.length} utilisateur(s)`);

    // Pour chaque utilisateur
    for (const user of users) {
      try {
        const isVisible = await checkGamesVisibility(user.steamId);
        if (!isVisible) {
          console.log(`[LOCKED] [SYNC] Profil privé pour ${user.steamId} — sync ignoré`);
          continue;
        }
        const result = await syncUserGames(user);
        updateStats(stats, result);
      } catch (error) {
        console.error('Erreur lors de la synchronisation des jeux pour un utilisateur:', error);
        stats.errors++;
      }
    }

    console.log('Synchronisation automatique terminée:', stats);
    return stats;
  } catch (error) {
    console.error(
      'Erreur lors de la synchronisation automatique des jeux:',
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
async function syncUserGroupByIndex(
  groupIndex,
  totalGroups = CRON_CONFIG.GROUPS_TOTAL
) {
  const groupsTotal =
    Number(totalGroups) > 0 ? Number(totalGroups) : CRON_CONFIG.GROUPS_TOTAL;
  const gi = Number(groupIndex);

  const stats = createStats({ groupIndex: gi, totalGroups: groupsTotal });

  if (!Number.isInteger(gi) || gi < 0 || gi >= groupsTotal) {
    console.warn(
      `[SYNC][BIBLIO] Index de groupe invalide (${groupIndex}) pour ${groupsTotal} groupes`
    );
    stats.errors++;
    return stats;
  }

  console.log(`Synchronisation du groupe ${gi + 1}/${groupsTotal} d'utilisateurs (bucket stable)`);

  try {
    const allUsers = await User.find({});
    stats.totalUsers = allUsers.length;

    if (allUsers.length === 0) {
      console.log('Aucun utilisateur trouvé, rien à synchroniser.');
      return stats;
    }

    const bucketUsers = allUsers.filter((user) =>
      isInBucket(user, gi, groupsTotal)
    );
    stats.usersInGroup = bucketUsers.length;

    console.log(
      `[SYNC][BIBLIO] Groupe ${gi} → ${bucketUsers.length} utilisateur(s) sur ${allUsers.length} au total`
    );

    if (bucketUsers.length === 0) {
      stats.skipped = true;
      console.log(
        `[SYNC][BIBLIO] Aucun utilisateur dans ce bucket, fin de la synchronisation du groupe ${gi + 1}/${
          groupsTotal
        }.`
      );
      return stats;
    }

    console.log('  - Listing des utilisateurs masqué pour raisons de confidentialité');

    for (const user of bucketUsers) {
      try {
        const isVisible = await checkGamesVisibility(user.steamId);
        if (!isVisible) {
          console.log(`[LOCKED] [SYNC] Profil privé pour ${user.steamId} — sync groupe ignoré`);
          continue;
        }
        const result = await syncUserGames(user);
        updateStats(stats, result);
      } catch (error) {
        console.error("Erreur lors de la synchronisation d'un utilisateur du groupe:", error);
        stats.errors++;
      }
    }

    console.log(
      `Synchronisation du groupe ${gi + 1}/${groupsTotal} terminée:`,
      stats
    );
    return stats;
  } catch (error) {
    console.error(
      `Erreur lors de la synchronisation du groupe ${gi + 1}/${groupsTotal}:`,
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
