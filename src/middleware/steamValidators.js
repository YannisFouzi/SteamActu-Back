/**
 * Validateurs pour les routes Steam
 */

/**
 * Valide un SteamID
 * @param {string} steamId - SteamID à valider
 * @returns {boolean} - True si valide
 */
function isValidSteamId(steamId) {
  return steamId && steamId.length >= 10;
}

/**
 * Middleware de validation SteamID pour Express
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @param {Function} next - Fonction next
 */
function validateSteamId(req, res, next) {
  const { steamId } = req.params;

  if (!isValidSteamId(steamId)) {
    return res.status(400).json({ message: "SteamID invalide" });
  }

  next();
}

module.exports = {
  isValidSteamId,
  validateSteamId,
};
