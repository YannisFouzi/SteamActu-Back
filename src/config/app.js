/**
 * Configuration de l'application Express
 * Centralise la configuration et les constantes
 */

require("dotenv").config();

// Configuration serveur
const SERVER_CONFIG = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI,
};

// Configuration sécurité
const SECURITY_CONFIG = {
  API_AUTH_KEY: process.env.API_AUTH_KEY || process.env.STEAM_API_KEY,
  MOBILE_REDIRECT_SCHEME: process.env.MOBILE_REDIRECT_SCHEME || "steamnotif",
  CORS_ORIGINS: process.env.CORS_ORIGINS?.split(",") || ["*"],
};

// Configuration CORS
const CORS_OPTIONS = {
  origin: SECURITY_CONFIG.CORS_ORIGINS,
  credentials: true,
  optionsSuccessStatus: 200,
};

// Messages d'erreur standardisés
const ERROR_MESSAGES = {
  INVALID_OPENID: "Réponse OpenID invalide",
  STEAMID_NOT_FOUND: "SteamID non trouvé dans la réponse",
  AUTH_ERROR: "Erreur lors de l'authentification",
  INVALID_API_KEY: "Clé API non valide ou manquante",
  USER_REGISTRATION_ERROR: "Erreur lors de l'enregistrement de l'utilisateur",
};

// Messages de succès
const SUCCESS_MESSAGES = {
  API_OPERATIONAL: "API de notifications Steam opérationnelle !",
  MONGODB_CONNECTED: "Connecté à MongoDB",
  SERVER_STARTED: (port) => `Serveur démarré sur le port ${port}`,
  USER_AUTHENTICATED: (steamId) =>
    `Utilisateur ${steamId} authentifié avec succès via Steam`,
};

module.exports = {
  SERVER_CONFIG,
  SECURITY_CONFIG,
  CORS_OPTIONS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
};
