/**
 * Tâches métier appelées par le scheduler Agenda.
 * Le locking distribué est géré nativement par Agenda (`lockedAt` atomique),
 * plus besoin de `JobLock` custom.
 */

const gamesSyncService = require('../../services/gamesSync');
const syncWishlistService = require('../../services/syncWishlistService');
const { CRON_CONFIG } = require('../app');

async function checkNews() {
  const stats = await require('../../services/newsRotationService').checkNewsRotation();
  return {
    message: `${stats.gamesChecked} jeux vérifiés, ${stats.notificationsSent} notifications envoyées`,
    ...stats,
  };
}

/**
 * Sync bibliothèques par groupe.
 * Utilise gamesSyncService.syncUserGroupByIndex(groupIndex, groupsTotal).
 */
async function syncUserGroup(opts = {}) {
  const { groupIndex = 0, groupsTotal = CRON_CONFIG.GROUPS_TOTAL } = opts;
  const requestedGroups =
    Number(groupsTotal) > 0 ? Number(groupsTotal) : CRON_CONFIG.GROUPS_TOTAL;

  if (typeof gamesSyncService.syncUserGroupByIndex === 'function') {
    const stats = await gamesSyncService.syncUserGroupByIndex(
      groupIndex,
      requestedGroups
    );
    return {
      message: `Groupe ${groupIndex + 1}/${requestedGroups} → ${stats.usersProcessed ?? 0} users`,
      groupIndex,
      groupsTotal: requestedGroups,
      ...stats,
    };
  }

  // Fallback ultime (ne devrait jamais arriver vu les services existants)
  const stats = await gamesSyncService.syncAllUsersGames();
  return {
    message: `Fallback FULL (service groupé jeux absent) → ${stats.usersProcessed ?? 0} users`,
    groupIndex,
    groupsTotal: requestedGroups,
    ...stats,
  };
}

/**
 * FULL sync (manuel) — alignée sur la vraie API : syncAllUsersGames().
 */
async function syncAllUsers() {
  const stats = await gamesSyncService.syncAllUsersGames();
  return {
    message: `${stats.usersProcessed ?? 0} utilisateurs synchronisés (FULL)`,
    ...stats,
  };
}

/**
 * Sync wishlists par groupe si le service le supporte.
 * Sinon : seul groupIndex=0 exécute un FULL (les autres groupes no-op
 * pour éviter 12× la charge).
 */
async function syncWishlists(opts = {}) {
  const { groupIndex = 0, groupsTotal = CRON_CONFIG.GROUPS_TOTAL } = opts;
  const requestedGroups =
    Number(groupsTotal) > 0 ? Number(groupsTotal) : CRON_CONFIG.GROUPS_TOTAL;

  if (
    syncWishlistService &&
    typeof syncWishlistService.syncWishlistsByGroup === 'function'
  ) {
    const stats = await syncWishlistService.syncWishlistsByGroup(
      groupIndex,
      requestedGroups
    );
    return {
      message:
        `Groupe ${groupIndex + 1}/${requestedGroups} → ` +
        `${stats.usersProcessed ?? 0} users, ` +
        `${stats.newGames ?? 0} nouveaux jeux, ` +
        `${stats.totalAutoFollowed ?? 0} auto-suivis`,
      groupIndex,
      groupsTotal: requestedGroups,
      ...stats,
    };
  }

  // Pas de méthode groupée → exécuter un seul FULL par jour (groupe 0), no-op sinon.
  if (
    syncWishlistService &&
    typeof syncWishlistService.syncAllUsersWishlists === 'function'
  ) {
    if (groupIndex === 0) {
      const stats = await syncWishlistService.syncAllUsersWishlists();
      return {
        message:
          `FULL wishlist (fallback, groupe 1/${requestedGroups}) → ` +
          `${stats.successCount ?? stats.usersProcessed ?? 0} users, ` +
          `${stats.newGames ?? 0} nouveaux jeux, ` +
          `${stats.totalAutoFollowed ?? 0} auto-suivis`,
        groupIndex,
        groupsTotal: requestedGroups,
        ...stats,
      };
    }
    return {
      message: `No-op wishlist (pas de méthode groupée) pour groupe ${groupIndex + 1}/${requestedGroups}`,
      groupIndex,
      groupsTotal: requestedGroups,
      skipped: true,
    };
  }

  return {
    message: 'Wishlist service indisponible: aucune action exécutée',
    groupIndex,
    groupsTotal: requestedGroups,
    skipped: true,
  };
}

module.exports = {
  checkNews,
  syncUserGroup,
  syncAllUsers,
  syncWishlists,
};
