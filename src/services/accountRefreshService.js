const User = require('../models/User');
const gamesSyncService = require('./gamesSync');
const syncWishlistService = require('./syncWishlistService');
const logger = require('../utils/logger');

/**
 * On-demand "refresh my account" — the manual equivalent of the daily cron, for
 * a SINGLE user. Reuses the EXACT per-user functions the cron calls, so there is
 * zero duplicated sync logic:
 *   - `gamesSyncService.syncUserGames(user)` → Steam library + Steam Family
 *   - `syncWishlistService.syncUserWishlist(steamId)` → wishlist
 *
 * Exposed (admin-only) to both surfaces: the mobile app (mobileAdmin route) and
 * the Steam Desktop plugin / web SPA (webApi route). Returns a small summary;
 * callers only need `ok`.
 */
async function refreshUserAccount(steamId) {
  const user = await User.findOne({ steamId });
  if (!user) {
    return { ok: false, error: 'user_not_found' };
  }

  let library = null;
  let wishlist = null;
  try {
    // Library + Steam Family (same path as the user-group-sync cron).
    library = await gamesSyncService.syncUserGames(user);
    // Wishlist (same path as the wishlist-sync cron).
    wishlist = await syncWishlistService.syncUserWishlist(steamId);
  } catch (error) {
    logger.error({ err: error, steamId }, 'account_refresh_failed');
    return { ok: false, error: 'refresh_failed' };
  }

  logger.info({ steamId }, 'account_refresh_done');
  return { ok: true, library, wishlist };
}

module.exports = { refreshUserAccount };
