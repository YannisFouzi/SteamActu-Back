/**
 * Middleware d'authentification
 * Gère la vérification des API keys
 */

const { SECURITY_CONFIG, ERROR_MESSAGES } = require("../config/app");

/**
 * Middleware pour vérifier l'API key
 * Permet l'accès libre aux routes d'authentification et à la racine
 */
const checkApiKey = (req, res, next) => {
  const apiKey = req.query.key || req.headers["x-api-key"];

  // Routes publiques (sans authentification)
  const publicPaths = ["/auth/", "/"];
  const isPublicPath = publicPaths.some(
    (path) => req.path.startsWith(path) || req.path === "/"
  );

  if (isPublicPath) {
    return next();
  }

  // Vérifier la clé d'authentification API
  if (apiKey && apiKey === SECURITY_CONFIG.API_AUTH_KEY) {
    return next();
  }

  return res.status(401).json({
    error: ERROR_MESSAGES.INVALID_API_KEY,
  });
};

/**
 * Middleware de validation des paramètres OpenID
 */
const validateOpenIdResponse = (req, res, next) => {
  if (!req.query["openid.identity"]) {
    return res.status(400).json({
      error: ERROR_MESSAGES.INVALID_OPENID,
    });
  }
  next();
};

/**
 * Extrait le SteamID de la réponse OpenID
 * @param {string} identity - URL d'identité OpenID
 * @returns {string|null} - SteamID extrait ou null
 */
const extractSteamId = (identity) => {
  const matches = identity.match(/\/id\/(\d+)$/);
  return matches && matches[1] ? matches[1] : null;
};

module.exports = {
  checkApiKey,
  validateOpenIdResponse,
  extractSteamId,
};
