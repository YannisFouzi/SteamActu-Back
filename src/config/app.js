/**
 * Configuration de l'application Express
 * Centralise la configuration et les constantes
 */

require('dotenv').config();

if (!process.env.MONGODB_URI) {
  console.error(
    '[Config] Missing MONGODB_URI. Define it in your environment before starting the server.'
  );
  process.exit(1);
}

if (!process.env.STEAM_API_KEY) {
  console.error(
    '[Config] Missing STEAM_API_KEY. Define it in your environment before starting the server.'
  );
  process.exit(1);
}

// Configuration serveur
const SERVER_CONFIG = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI,
};

// Configuration securite
const SECURITY_CONFIG = {
  API_AUTH_KEY: process.env.API_AUTH_KEY || process.env.STEAM_API_KEY,
  MOBILE_REDIRECT_SCHEME: process.env.MOBILE_REDIRECT_SCHEME || 'steamnotif',
  CORS_ORIGINS: process.env.CORS_ORIGINS?.split(',') || ['*'],
};

// Configuration CORS
const CORS_OPTIONS = {
  origin: SECURITY_CONFIG.CORS_ORIGINS,
  credentials: true,
  optionsSuccessStatus: 200,
};

// Configuration Steam
const STEAM_CONFIG = {
  apiKey: process.env.STEAM_API_KEY,
  baseUrl: 'https://api.steampowered.com',
};

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Configuration base de donnees
const DATABASE_CONFIG = {
  uri: process.env.MONGODB_URI,
  options: {
    serverSelectionTimeoutMS: toNumber(
      process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
      10000
    ),
    socketTimeoutMS: toNumber(process.env.MONGODB_SOCKET_TIMEOUT_MS, 45000),
    family: toNumber(process.env.MONGODB_FAMILY, 4),
  },
};

// Configuration notifications
const NOTIFICATION_CONFIG = {
  provider: process.env.NOTIFICATION_PROVIDER || 'simulation',
  oneSignalAppId: process.env.ONESIGNAL_APP_ID,
  oneSignalApiKey: process.env.ONESIGNAL_API_KEY,
  firebaseServiceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
};

// Configuration cron
const CRON_GROUPS_TOTAL_RAW = toNumber(process.env.CRON_GROUPS_TOTAL, 12);
const CRON_GROUPS_TOTAL =
  Number.isFinite(CRON_GROUPS_TOTAL_RAW) && CRON_GROUPS_TOTAL_RAW > 0
    ? CRON_GROUPS_TOTAL_RAW
    : 12;

if (CRON_GROUPS_TOTAL !== 12) {
  console.warn(
    `[CRON] CRON_GROUPS_TOTAL=${CRON_GROUPS_TOTAL} ignoré car fenêtre fixe 03→14 (12 slots). Forçage à 12.`
  );
}

const CRON_CONFIG = {
  GROUPS_TOTAL: 12,
  LOCK_TTL_MS: toNumber(
    process.env.CRON_LOCK_TTL_MS,
    2 * 60 * 60 * 1000 // 2 heures par défaut
  ),
  TIMEZONE: process.env.CRON_TIMEZONE || 'Europe/Paris',
};

// Messages d'erreur standardises
const ERROR_MESSAGES = {
  INVALID_OPENID: 'Reponse OpenID invalide',
  STEAMID_NOT_FOUND: 'SteamID non trouve dans la reponse',
  AUTH_ERROR: "Erreur lors de l'authentification",
  USER_REGISTRATION_ERROR: "Erreur lors de l'enregistrement de l'utilisateur",
};

// Messages de succes
const SUCCESS_MESSAGES = {
  API_OPERATIONAL: 'API de notifications Steam operationnelle !',
  MONGODB_CONNECTED: 'Connecte a MongoDB',
  SERVER_STARTED: (port) => `Serveur demarre sur le port ${port}`,
  USER_AUTHENTICATED: () =>
    `Utilisateur authentifie avec succes via Steam`,
};

module.exports = {
  SERVER_CONFIG,
  SECURITY_CONFIG,
  DATABASE_CONFIG,
  STEAM_CONFIG,
  NOTIFICATION_CONFIG,
  CRON_CONFIG,
  CORS_OPTIONS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
};
