/**
 * Middleware global de gestion des erreurs
 * Capture toutes les erreurs non gérées et standardise les réponses
 */

const logger = require('../utils/logger');

const errorHandler = (err, req, res, _next) => {
  logger.error(
    {
      err,
      method: req.method,
      path: req.originalUrl,
    },
    'unhandled_request_error'
  );

  if (err.code === 11000) {
    return res.status(409).json({
      message: 'Ressource déjà existante',
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      message: 'Données invalides',
      errors: Object.values(err.errors).map((e) => e.message),
    });
  }

  res.status(err.status || 500).json({
    message: err.message || 'Erreur serveur interne',
  });
};

module.exports = errorHandler;
