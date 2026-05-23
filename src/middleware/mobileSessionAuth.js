const { SECURITY_CONFIG } = require('../config/app');
const { verifyMobileSessionToken } = require('../services/mobileSessionService');

const BEARER_PREFIX = 'Bearer ';

function mobileSessionAuth(req, res, next) {
  const header = req.get('authorization');

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return res.status(401).json({ message: 'Mobile session required' });
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  const session = verifyMobileSessionToken(token);

  if (!session) {
    return res.status(401).json({ message: 'Invalid or expired mobile session' });
  }

  req.mobileSession = session;
  return next();
}

function isMobileAdminSession(session) {
  const adminSteamIds = Array.isArray(SECURITY_CONFIG.ADMIN_STEAM_IDS)
    ? SECURITY_CONFIG.ADMIN_STEAM_IDS
    : [];

  return Boolean(session?.steamId && adminSteamIds.includes(session.steamId));
}

function requireMobileAdmin(req, res, next) {
  if (!isMobileAdminSession(req.mobileSession)) {
    return res.status(403).json({ message: 'Admin access denied' });
  }

  return next();
}

module.exports = {
  isMobileAdminSession,
  mobileSessionAuth,
  requireMobileAdmin,
};
