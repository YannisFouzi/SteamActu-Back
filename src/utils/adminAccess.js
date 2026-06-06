const { SECURITY_CONFIG } = require('../config/app');

/**
 * True if the given SteamID is in the admin allowlist (`ADMIN_STEAM_IDS` env).
 * Single source of truth for "is this user an admin?", reused by the mobile
 * session gate and the public-by-SteamID (plugin/web) surface.
 */
function isAdminSteamId(steamId) {
  const ids = Array.isArray(SECURITY_CONFIG.ADMIN_STEAM_IDS)
    ? SECURITY_CONFIG.ADMIN_STEAM_IDS
    : [];
  return Boolean(steamId && ids.includes(String(steamId)));
}

module.exports = { isAdminSteamId };
