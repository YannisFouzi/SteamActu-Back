/**
 * Middleware d'authentification
 * Gère la validation OpenID et l'extraction du SteamID
 */

const { ERROR_MESSAGES } = require("../config/app");

/**
 * Middleware de validation des paramètres OpenID
 */
const validateOpenIdResponse = (req, res, next) => {
  if (!req.query["openid.identity"]) {
    return res.status(400).json({
      message: ERROR_MESSAGES.INVALID_OPENID,
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
  validateOpenIdResponse,
  extractSteamId,
};
