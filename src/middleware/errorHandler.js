/**
 * Middleware global de gestion des erreurs
 * Capture toutes les erreurs non gérées et standardise les réponses
 */

const errorHandler = (err, _req, res, _next) => {
  console.error('Erreur serveur:', err);

  // Erreurs MongoDB (duplicate key, etc.)
  if (err.code === 11000) {
    return res.status(409).json({
      message: 'Ressource déjà existante',
    });
  }

  // Erreurs de validation Mongoose
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Données invalides',
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  // Erreur par défaut
  res.status(err.status || 500).json({
    message: err.message || 'Erreur serveur interne',
  });
};

module.exports = errorHandler;
