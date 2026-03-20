/**
 * Validateurs pour les routes Steam et paramètres communs
 */

const STEAM_ID_REGEX = /^\d{17}$/;
const APP_ID_REGEX = /^\d+$/;

/**
 * Valide un SteamID (17 chiffres exactement)
 * @param {string} steamId
 * @returns {boolean}
 */
function isValidSteamId(steamId) {
  return typeof steamId === 'string' && STEAM_ID_REGEX.test(steamId);
}

/**
 * Valide un AppID Steam (entier positif)
 * @param {string} appId
 * @returns {boolean}
 */
function isValidAppId(appId) {
  return typeof appId === 'string' && APP_ID_REGEX.test(appId) && appId !== '0';
}

/**
 * Middleware de validation SteamID depuis req.params
 */
function validateSteamId(req, res, next) {
  const { steamId } = req.params;

  if (!isValidSteamId(steamId)) {
    return res.status(400).json({ message: 'SteamID invalide' });
  }

  next();
}

/**
 * Middleware de validation SteamID depuis req.body
 */
function validateBodySteamId(req, res, next) {
  const { steamId } = req.body || {};

  if (!isValidSteamId(steamId)) {
    return res.status(400).json({ message: 'SteamID invalide' });
  }

  next();
}

/**
 * Middleware de validation AppID depuis req.params
 */
function validateAppId(req, res, next) {
  const { appId } = req.params;

  if (!isValidAppId(appId)) {
    return res.status(400).json({ message: 'AppID invalide' });
  }

  next();
}

/**
 * Parse un query param en entier avec bornes. Retourne le default si absent ou invalide.
 * @param {string|undefined} value
 * @param {number} defaultValue
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clampQueryInt(value, defaultValue, min, max) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(Math.max(parsed, min), max);
}

module.exports = {
  isValidSteamId,
  isValidAppId,
  validateSteamId,
  validateBodySteamId,
  validateAppId,
  clampQueryInt,
};
