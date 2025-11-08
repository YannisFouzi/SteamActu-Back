/**
 * Validateurs pour les routes utilisateurs
 */

const User = require('../models/User');
const { migrateGameLibrary } = require('../services/users/gameProcessor');

/**
 * Middleware pour vérifier qu'un utilisateur existe
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @param {Function} next - Fonction next
 */
async function validateUserExists(req, res, next) {
  try {
    const { steamId } = req.params;
    console.log('Validation utilisateur pour steamId:', steamId);

    const user = await User.findOne({ steamId });
    console.log('Utilisateur trouvé:', user ? 'OUI' : 'NON');

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Erreur dans validateUserExists:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
}

/**
 * Middleware pour migrer les données utilisateur
 * Effectue la migration de la bibliothèque de jeux
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @param {Function} next - Fonction next
 */
function migrateUserData(req, res, next) {
  if (req.user) {
    migrateGameLibrary(req.user);
  }
  next();
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
  migrateUserData,
  validateActiveGamesFormat,
};
