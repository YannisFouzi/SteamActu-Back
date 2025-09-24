/**
 * Validateurs pour les routes utilisateurs
 */

/**
 * Middleware pour vérifier qu'un utilisateur existe
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @param {Function} next - Fonction next
 */
async function validateUserExists(req, res, next) {
  try {
    const { steamId } = req.params;
    console.log("Validation utilisateur pour steamId:", steamId);
    const User = require("../models/User");

    const user = await User.findOne({ steamId });
    console.log("Utilisateur trouvé:", user ? "OUI" : "NON");

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Attacher l'utilisateur à la requête pour éviter une nouvelle requête
    req.user = user;
    next();
  } catch (error) {
    console.error("Erreur dans validateUserExists:", error);
    res.status(500).json({ message: "Erreur serveur" });
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
