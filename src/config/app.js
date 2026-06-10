/**
 * Configuration de l'application Express
 * Centralise la configuration et les constantes
 */

require('dotenv').config();

// NOTE : les 3 `console.*` ci-dessous sont volontaires. Ce fichier est require()
// AVANT que `utils/logger` (pino) puisse etre instancie (cycle : logger require
// implicitement la conf). En cas de bootstrap manquant, on log brut + process.exit(1).

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

const API_AUTH_KEY = process.env.API_AUTH_KEY || process.env.STEAM_API_KEY;
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || '';
const MOBILE_SESSION_TTL_DAYS = Math.max(
  1,
  toNumber(process.env.MOBILE_SESSION_TTL_DAYS, 30)
);

function parseCsvList(value, fallback = []) {
  if (!value || typeof value !== 'string') {
    return fallback;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
}

// Configuration securite
const SECURITY_CONFIG = {
  API_AUTH_KEY,
  MOBILE_REDIRECT_SCHEME: process.env.MOBILE_REDIRECT_SCHEME || 'steamnotif',
  MOBILE_SESSION_SECRET:
    process.env.MOBILE_SESSION_SECRET || ADMIN_SESSION_SECRET || API_AUTH_KEY,
  MOBILE_SESSION_TTL_MS: MOBILE_SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  CORS_ORIGINS: process.env.CORS_ORIGINS?.split(',') || ['*'],
  // Dashboard /admin — auth dual : cookie signe (UI) OU Bearer token (API).
  // Si ADMIN_PASSWORD_HASH vide -> formulaire login desactive.
  // Si ADMIN_TOKEN vide -> header Bearer refuse.
  // Si les 2 vides -> routes /admin repondent 503.
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || '',
  ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH || '',
  ADMIN_SESSION_SECRET,
  ADMIN_SESSION_MAX_AGE_MS: 24 * 60 * 60 * 1000, // 24h
  ADMIN_STEAM_IDS: parseCsvList(process.env.ADMIN_STEAM_IDS, []),
};

// Configuration CORS
// `credentials` est volontairement DESACTIVE : l'API s'authentifie uniquement
// par Bearer token (header Authorization), jamais par cookie cross-origin. Le
// seul cookie (session /admin) est same-origin + SameSite=Strict, il ne transite
// donc jamais en cross-origin. Activer `credentials: true` en plus d'une origine
// `*` est par ailleurs invalide selon la spec CORS (le navigateur rejette la
// reponse). On le laisse a false pour fermer ce vecteur latent.
const CORS_OPTIONS = {
  origin: SECURITY_CONFIG.CORS_ORIGINS,
  credentials: false,
  optionsSuccessStatus: 200,
};

// Configuration Steam
const STEAM_CONFIG = {
  apiKey: process.env.STEAM_API_KEY,
  baseUrl: 'https://api.steampowered.com',
};

// Simulation profil privé (dev uniquement)
const SIMULATION_CONFIG = {
  privateProfile: process.env.SIMULATE_PRIVATE_PROFILE === 'true',
};

// Configuration SteamGridDB (icônes haute qualité)
const STEAMGRIDDB_CONFIG = {
  apiKey: process.env.STEAMGRIDDB_API_KEY || '',
  baseUrl: 'https://www.steamgriddb.com/api/v2',
};

const FEEDBACK_CONFIG = {
  toEmail: process.env.FEEDBACK_TO_EMAIL || 'contact@fouzi-dev.fr',
  fromEmail:
    process.env.FEEDBACK_FROM_EMAIL ||
    'Game News <noreply@fouzi-dev.fr>',
  resendApiKey: process.env.RESEND_API_KEY || '',
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
    `[CRON] CRON_GROUPS_TOTAL=${CRON_GROUPS_TOTAL} ignoré car cycle fixe de 12 buckets sur 12h. Forçage à 12.`
  );
}

const CRON_CONFIG = {
  GROUPS_TOTAL: 12,
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
  STEAMGRIDDB_CONFIG,
  FEEDBACK_CONFIG,
  NOTIFICATION_CONFIG,
  CRON_CONFIG,
  CORS_OPTIONS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  SIMULATION_CONFIG,
};
