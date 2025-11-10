// Services réels côté jeux (confirmés par ton fichier)
const gamesSyncService = require('../../services/gamesSync'); // expose: syncAllUsersGames, syncUserGroupByIndex, syncUserGames
// Wishlist: on gère la compatibilité côté code (groupée si dispo, sinon full)
const syncWishlistService = require('../../services/syncWishlistService');
const { acquireLock } = require('../../services/cron/jobLockService');
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
 * -> utilise gamesSyncService.syncUserGroupByIndex(groupIndex, groupsTotal)
 */
async function syncUserGroup(opts = {}) {
  const { groupIndex = 0, groupsTotal = CRON_CONFIG.GROUPS_TOTAL } = opts;
  const requestedGroups =
    Number(groupsTotal) > 0 ? Number(groupsTotal) : CRON_CONFIG.GROUPS_TOTAL;
  const lockAcquired = await acquireLock('USER_GROUP_SYNC', groupIndex);
  if (!lockAcquired) {
    return {
      message: `Groupe ${groupIndex + 1}/${requestedGroups} → skip (lock)`,
      groupIndex,
      groupsTotal: requestedGroups,
      skipped: true,
      lockAcquired: false,
    };
  }

  // Appelle la méthode groupée EXISTANTE
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
      lockAcquired: true,
    };
  }

  // Fallback ultime (devrait ne jamais arriver vu tes services)
  const stats = await gamesSyncService.syncAllUsersGames();
  return {
    message: `Fallback FULL (service groupé jeux absent) → ${stats.usersProcessed ?? 0} users`,
    groupIndex,
    groupsTotal: requestedGroups,
    ...stats,
    lockAcquired: true,
  };
}

/**
 * FULL sync (manuel) — alignée sur ta vraie API: syncAllUsersGames()
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
 * Sinon: seul groupIndex=0 exécute un FULL (les autres groupes no-op pour éviter 12x la charge).
 */
async function syncWishlists(opts = {}) {
  const { groupIndex = 0, groupsTotal = CRON_CONFIG.GROUPS_TOTAL } = opts;
  const requestedGroups =
    Number(groupsTotal) > 0 ? Number(groupsTotal) : CRON_CONFIG.GROUPS_TOTAL;
  const lockAcquired = await acquireLock('WISHLIST_SYNC', groupIndex);
  if (!lockAcquired) {
    return {
      message: `Groupe ${groupIndex + 1}/${requestedGroups} → skip (lock)`,
      groupIndex,
      groupsTotal: requestedGroups,
      skipped: true,
      lockAcquired: false,
    };
  }

  // Méthode groupée disponible ?
  if (syncWishlistService && typeof syncWishlistService.syncWishlistsByGroup === 'function') {
    const stats = await syncWishlistService.syncWishlistsByGroup(
      groupIndex,
      requestedGroups
    );
    return {
      message:
        `Groupe ${groupIndex + 1}/${requestedGroups} → `
        + `${stats.usersProcessed ?? 0} users, `
        + `${stats.newGames ?? 0} nouveaux jeux, `
        + `${stats.totalAutoFollowed ?? 0} auto-suivis`,
      groupIndex,
      groupsTotal: requestedGroups,
      ...stats,
      lockAcquired: true,
    };
  }

  // Pas de méthode groupée → exécuter un seul "full" par jour (groupe 0), no-op sinon.
  if (syncWishlistService && typeof syncWishlistService.syncAllUsersWishlists === 'function') {
    if (groupIndex === 0) {
      const stats = await syncWishlistService.syncAllUsersWishlists();
      return {
        message:
          `FULL wishlist (fallback, groupe 1/${requestedGroups}) → `
          + `${stats.successCount ?? stats.usersProcessed ?? 0} users, `
          + `${stats.newGames ?? 0} nouveaux jeux, `
          + `${stats.totalAutoFollowed ?? 0} auto-suivis`,
        groupIndex,
        groupsTotal: requestedGroups,
        ...stats,
        lockAcquired: true,
      };
    }
    // Groupes 1..11 : no-op pour éviter 12x le FULL
    return {
      message: `No-op wishlist (pas de méthode groupée) pour groupe ${groupIndex + 1}/${requestedGroups}`,
      groupIndex,
      groupsTotal: requestedGroups,
      skipped: true,
      lockAcquired: true,
    };
  }

  // Service wishlist absent
  return {
    message: 'Wishlist service indisponible: aucune action exécutée',
    groupIndex,
    groupsTotal: requestedGroups,
    skipped: true,
    lockAcquired: true,
  };
}

module.exports = {
  checkNews,
  syncUserGroup,
  syncAllUsers,
  syncWishlists,
};
