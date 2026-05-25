/**
 * Validateurs pour les routes utilisateurs
 */

const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware pour vérifier qu'un utilisateur existe
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @param {Function} next - Fonction next
 */
async function validateUserExists(req, res, next) {
  try {
    const { steamId } = req.params;
    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error({ err: error }, 'validateUserExists_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
}

/**
 * Valide le format des jeux actifs
 * @param {Array} games - Liste des jeux
 * @returns {boolean} - True si valide
 */
function validateActiveGamesFormat(games) {
  return Array.isArray(games);
}

module.exports = {
  validateUserExists,
  validateActiveGamesFormat,
};
