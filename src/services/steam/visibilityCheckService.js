/**
 * Orchestration partagée « Vérifier mon profil » : teste la visibilité du profil
 * Steam (jeux / wishlist) et lance le sync conditionnel si c'est public.
 *
 * La logique vit ici UNE seule fois et alimente toutes les surfaces :
 *  - app mobile        → POST /api/steam/check-visibility (session OpenID)
 *  - Steam Desktop /
 *    web / extension   → POST /api/web/check-visibility (requireWebAuth)
 *
 * Les fonctions sont agnostiques du transport : elles renvoient un résultat
 * discriminé que les routes mappent en HTTP.
 *   { ok: true, body }              → 200 + body
 *   { ok: false, status, message }  → status + { message }
 * Toute erreur inattendue throw (les routes la catchent en 500).
 */

const { fetchUserGames, fetchUserWishlist } = require('./apiClient');
const { syncUserGames } = require('../gamesSync/userProcessor');
const { syncUserWishlist } = require('../syncWishlistService');
const User = require('../../models/User');
const logger = require('../../utils/logger');

// Steam n'inclut les champs de temps de jeu que si « temps de jeu » est public.
// Leur présence sert à distinguer « jeux visibles » de « jeux + temps visibles ».
function hasSteamPlaytimeFields(game) {
  if (!game || typeof game !== 'object') {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(game, 'playtime_forever') ||
    Object.prototype.hasOwnProperty.call(game, 'playtime_2weeks') ||
    Object.prototype.hasOwnProperty.call(game, 'rtime_last_played')
  );
}

async function getWishlistVisibilityState(steamId) {
  try {
    const items = await fetchUserWishlist(steamId);
    return {
      visible: Array.isArray(items) && items.length > 0,
      count: Array.isArray(items) ? items.length : 0,
      items: Array.isArray(items) ? items : [],
    };
  } catch (error) {
    logger.warn(
      `[VISIBILITY] Wishlist inaccessible pour ${steamId}:`,
      error?.message || error
    );
    return {
      visible: false,
      count: 0,
      items: [],
    };
  }
}

// Vérifie la visibilité de la bibliothèque ; si public, sync complet games +
// wishlist. Si seule la wishlist est visible, on la sync quand même.
async function checkProfileVisibilityAndSync(steamId) {
  const games = await fetchUserGames(steamId);

  if (!games || games.length === 0) {
    const wishlistState = await getWishlistVisibilityState(steamId);

    if (wishlistState.visible) {
      await syncUserWishlist(steamId, wishlistState.items);
    }

    return {
      ok: true,
      body: {
        visible: false,
        gamesVisible: false,
        gameDetailsVisible: wishlistState.visible,
        wishlistVisible: wishlistState.visible,
        playtimeVisible: false,
        gamesCount: 0,
        wishlistCount: wishlistState.count,
      },
    };
  }

  const playtimeVisible = games.some(hasSteamPlaytimeFields);

  const user = await User.findOne({ steamId });
  if (!user) {
    return { ok: false, status: 404, message: 'Utilisateur non trouvé' };
  }

  await syncUserGames(user, { force: true, reason: 'check-visibility' });
  await syncUserWishlist(steamId);

  logger.info(
    `[OK] [CHECK-VISIBILITY] Profil public détecté pour ${steamId} — sync complet effectué`
  );

  return {
    ok: true,
    body: {
      visible: true,
      gamesVisible: true,
      gameDetailsVisible: true,
      playtimeVisible,
      gamesCount: games.length,
    },
  };
}

// Vérifie la visibilité de la wishlist (et, au passage, des jeux). Sync de ce
// qui est visible.
async function checkWishlistVisibilityAndSync(steamId) {
  const [wishlistItems, games] = await Promise.all([
    fetchUserWishlist(steamId),
    fetchUserGames(steamId).catch((err) => {
      logger.warn(
        `[CHECK-WISHLIST-VISIBILITY] fetchUserGames a échoué pour ${steamId}:`,
        err?.message || err
      );
      return [];
    }),
  ]);

  const wishlistVisible = Array.isArray(wishlistItems) && wishlistItems.length > 0;
  const gamesVisible = Array.isArray(games) && games.length > 0;

  if (!wishlistVisible && !gamesVisible) {
    return {
      ok: true,
      body: {
        visible: false,
        wishlistVisible: false,
        gamesVisible: false,
        playtimeVisible: false,
        wishlistCount: 0,
        gamesCount: 0,
      },
    };
  }

  const user = await User.findOne({ steamId });
  if (!user) {
    return { ok: false, status: 404, message: 'Utilisateur non trouvé' };
  }

  if (wishlistVisible) {
    const syncResult = await syncUserWishlist(steamId, wishlistItems);
    if (!syncResult?.success) {
      return {
        ok: false,
        status: 500,
        message: 'Erreur lors de la synchronisation de la wishlist',
      };
    }
  }

  if (gamesVisible) {
    await syncUserGames(user, {
      force: true,
      reason: 'check-wishlist-visibility',
    });
  }

  const playtimeVisible = gamesVisible && games.some(hasSteamPlaytimeFields);

  return {
    ok: true,
    body: {
      visible: wishlistVisible,
      wishlistVisible,
      gamesVisible,
      playtimeVisible,
      wishlistCount: wishlistVisible ? wishlistItems.length : 0,
      gamesCount: gamesVisible ? games.length : 0,
    },
  };
}

module.exports = {
  checkProfileVisibilityAndSync,
  checkWishlistVisibilityAndSync,
  hasSteamPlaytimeFields,
  getWishlistVisibilityState,
};
