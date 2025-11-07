const gamesSyncService = require("../../services/gamesSyncService");
const newsRotationService = require("../../services/newsRotationService");
const syncWishlistService = require("../../services/syncWishlistService");

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
 * Synchronisation par groupe d'utilisateurs
 */
async function syncUserGroup() {
  // DEBUG/MIGRATION: Log début cron
  console.log("\n" + "=".repeat(70));
  console.log("[DEBUG/MIGRATION] CRON USER_GROUP_SYNC - START");
  const startTime = Date.now();

  const currentHour = new Date().getHours();
  const groupIndex = currentHour % 12;
  const totalGroups = 12;

  console.log(`Heure actuelle: ${new Date().toLocaleTimeString()}`);
  console.log(`Groupe index: ${groupIndex} / ${totalGroups}`);
  console.log("=".repeat(70) + "\n");

  const stats = await gamesSyncService.syncUserGroupByIndex(
    groupIndex,
    totalGroups
  );

  // DEBUG/MIGRATION: Log fin cron
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("\n" + "=".repeat(70));
  console.log("[DEBUG/MIGRATION] CRON USER_GROUP_SYNC - END");
  console.log(`Durée: ${duration}s`);
  console.log(`Stats: ${JSON.stringify(stats)}`);
  console.log("=".repeat(70) + "\n");

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


module.exports = {
  checkNews,
  syncUserGroup,
  syncAllUsers,
  syncWishlists,
};
