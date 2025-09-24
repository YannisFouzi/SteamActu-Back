const gamesSyncService = require("../../services/gamesSyncService");
const newsChecker = require("../../utils/newsChecker");

/**
 * Définitions des tâches planifiées
 */

/**
 * Vérification des actualités pour tous les utilisateurs
 */
async function checkNews() {
  const notificationsSent = await newsChecker.checkNewsForAllUsers();
  return `${notificationsSent} notifications envoyées`;
}

/**
 * Synchronisation par groupe d'utilisateurs
 */
async function syncUserGroup() {
  const currentHour = new Date().getHours();
  const groupIndex = currentHour % 12;
  const totalGroups = 12;

  const stats = await gamesSyncService.syncUserGroupByIndex(
    groupIndex,
    totalGroups
  );
  return {
    ...stats,
    group: `${groupIndex + 1}/${totalGroups}`,
  };
}

/**
 * Synchronisation complète hebdomadaire
 */
async function syncAllUsers() {
  const stats = await gamesSyncService.syncAllUsersGames();
  return stats;
}

module.exports = {
  checkNews,
  syncUserGroup,
  syncAllUsers,
};
