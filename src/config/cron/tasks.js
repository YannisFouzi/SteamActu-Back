// Services réels côté jeux (confirmés par ton fichier)
const gamesSyncService = require('../../services/gamesSyncService'); // expose: syncAllUsersGames, syncUserGroupByIndex, syncUserGames
// Wishlist: on gère la compatibilité côté code (groupée si dispo, sinon full)
const syncWishlistService = require('../../services/syncWishlistService');

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
  const { groupIndex = 0, groupsTotal = 1 } = opts;

  // Appelle la méthode groupée EXISTANTE
  if (typeof gamesSyncService.syncUserGroupByIndex === 'function') {
    const stats = await gamesSyncService.syncUserGroupByIndex(groupIndex, groupsTotal);
    return {
      message: `Groupe ${groupIndex + 1}/${groupsTotal} → ${stats.usersProcessed ?? 0} users`,
      groupIndex,
      groupsTotal,
      ...stats,
    };
  }

  // Fallback ultime (devrait ne jamais arriver vu tes services)
  const stats = await gamesSyncService.syncAllUsersGames();
  return {
    message: `Fallback FULL (service groupé jeux absent) → ${stats.usersProcessed ?? 0} users`,
    groupIndex,
    groupsTotal,
    ...stats,
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
  const { groupIndex = 0, groupsTotal = 1 } = opts;

  // Méthode groupée disponible ?
  if (syncWishlistService && typeof syncWishlistService.syncWishlistsByGroup === 'function') {
    const stats = await syncWishlistService.syncWishlistsByGroup(groupIndex, groupsTotal);
    return {
      message:
        `Groupe ${groupIndex + 1}/${groupsTotal} → `
        + `${stats.usersProcessed ?? 0} users, `
        + `${stats.newGames ?? 0} nouveaux jeux, `
        + `${stats.totalAutoFollowed ?? 0} auto-suivis`,
      groupIndex,
      groupsTotal,
      ...stats,
    };
  }

  // Pas de méthode groupée → exécuter un seul "full" par jour (groupe 0), no-op sinon.
  if (syncWishlistService && typeof syncWishlistService.syncAllUsersWishlists === 'function') {
    if (groupIndex === 0) {
      const stats = await syncWishlistService.syncAllUsersWishlists();
      return {
        message:
          `FULL wishlist (fallback, groupe 1/${groupsTotal}) → `
          + `${stats.successCount ?? stats.usersProcessed ?? 0} users, `
          + `${stats.newGames ?? 0} nouveaux jeux, `
          + `${stats.totalAutoFollowed ?? 0} auto-suivis`,
        groupIndex,
        groupsTotal,
        ...stats,
      };
    }
    // Groupes 1..11 : no-op pour éviter 12x le FULL
    return {
      message: `No-op wishlist (pas de méthode groupée) pour groupe ${groupIndex + 1}/${groupsTotal}`,
      groupIndex,
      groupsTotal,
      skipped: true,
    };
  }

  // Service wishlist absent
  return {
    message: 'Wishlist service indisponible: aucune action exécutée',
    groupIndex,
    groupsTotal,
    skipped: true,
  };
}

module.exports = {
  checkNews,
  syncUserGroup,
  syncAllUsers,
  syncWishlists,
};
