const gamesSyncService = require("../../services/gamesSyncService");
const newsChecker = require("../../utils/newsChecker");
const newsRotationService = require("../../services/newsRotationService");
const syncWishlistService = require("../../services/syncWishlistService");
const syncLibraryService = require("../../services/syncLibraryService");

/**
 * Définitions des tâches planifiées
 */

/**
 * Vérification des actualités avec rotation intelligente (NOUVEAU)
 */
async function checkNews() {
  const stats = await newsRotationService.checkNewsRotation();
  return `${stats.gamesChecked} jeux vérifiés, ${stats.notificationsSent} notifications envoyées`;
}

/**
 * Vérification des actualités (ancienne méthode, conservée pour compatibilité)
 */
async function checkNewsOld() {
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

/**
 * Synchronisation des wishlists de tous les utilisateurs (NOUVEAU)
 */
async function syncWishlists() {
  const stats = await syncWishlistService.syncAllUsersWishlists();
  return `${stats.successCount} utilisateurs synchronisés, ${stats.totalNewGames} nouveaux jeux, ${stats.totalAutoFollowed} auto-suivis`;
}

/**
 * Synchronisation des bibliothèques de tous les utilisateurs (NOUVEAU)
 */
async function syncLibraries() {
  const stats = await syncLibraryService.syncAllUsersLibraries();
  return `${stats.successCount} utilisateurs synchronisés, ${stats.totalNewGames} nouveaux jeux, ${stats.totalAutoFollowed} auto-suivis`;
}

module.exports = {
  checkNews,
  checkNewsOld,
  syncUserGroup,
  syncAllUsers,
  syncWishlists,
  syncLibraries,
};
