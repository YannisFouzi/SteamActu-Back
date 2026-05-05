/**
 * Client API Steam
 * Centralise les appels à l'API Steam avec gestion d'erreurs
 */

const axios = require('axios');
const { STEAM_CONFIG, SIMULATION_CONFIG } = require('../../config/app');
const {
  normalizeAppLanguage,
  toSteamNewsLanguage,
  toSteamStoreLanguage,
} = require('../../utils/language');
const logger = require('../../utils/logger');

const STEAM_API_KEY = STEAM_CONFIG.apiKey;
const STEAM_BASE_URL = STEAM_CONFIG.baseUrl;

/**
 * Erreur custom levée par `makeApiCall` quand l'API Steam répond avec un
 * code HTTP d'erreur. Permet aux callers de distinguer :
 *   - `isExpected`     : erreurs "normales" côté Steam (jeu privé/NDA, retiré,
 *                        région) → ne doivent pas spammer Sentry, cooldown long.
 *   - `isRateLimited`  : 429 → silencieux, cooldown modéré.
 *   - autres           : vraies pannes (5xx, timeout, réseau) → event Sentry.
 *
 * Usage côté caller :
 *   try { await fetchGameNews(...) }
 *   catch (err) {
 *     if (err instanceof SteamApiError && err.isExpected) { ... }
 *   }
 */
class SteamApiError extends Error {
  constructor(message, { status = null, code = null, context = null, cause = null } = {}) {
    super(message);
    this.name = 'SteamApiError';
    this.status = status;       // code HTTP (403, 404, 429, 500...) ou null si pas de réponse
    this.code = code;           // code Axios (ECONNABORTED, ETIMEDOUT...) ou null
    this.context = context;     // ex. "getGameNews (123456)" pour les logs
    if (cause) this.cause = cause;
  }

  /**
   * Erreur "attendue" : le jeu est inaccessible côté Steam (privé, NDA, retiré,
   * restriction régionale). Pas une panne, on ne veut pas alerter là-dessus.
   */
  get isExpected() {
    return this.status === 403 || this.status === 404;
  }

  /** Rate limit Steam : ralentir, pas alerter. */
  get isRateLimited() {
    return this.status === 429;
  }

  /** Vraie panne serveur : Steam en rade. */
  get isServerError() {
    return this.status != null && this.status >= 500 && this.status < 600;
  }
}

// URLs des endpoints Steam
const ENDPOINTS = {
  OWNED_GAMES: `${STEAM_BASE_URL}/IPlayerService/GetOwnedGames/v0001/`,
  RECENTLY_PLAYED: `${STEAM_BASE_URL}/IPlayerService/GetRecentlyPlayedGames/v0001/`,
  GAME_NEWS: `${STEAM_BASE_URL}/ISteamNews/GetNewsForApp/v0002/`,
  PLAYER_SUMMARIES: `${STEAM_BASE_URL}/ISteamUser/GetPlayerSummaries/v0002/`,
  WISHLIST: `${STEAM_BASE_URL}/IWishlistService/GetWishlist/v1/`,
};

// Axios n'applique aucun timeout par défaut : sans cap, un appel Steam peut
// bloquer le handler HTTP indéfiniment. 10 s couvre même les gros
// GetOwnedGames ; les endpoints sensibles (news) passent une valeur plus basse.
const DEFAULT_STEAM_API_TIMEOUT_MS = 10000;

/**
 * Effectue un appel API Steam avec gestion d'erreurs standardisée
 * @param {string} url - URL de l'endpoint
 * @param {Object} params - Paramètres de la requête
 * @param {string} context - Contexte pour les logs d'erreur
 * @param {Object} [options]
 * @param {number} [options.timeout] - Timeout en ms (défaut 10 s)
 * @returns {Promise<Object>} - Réponse de l'API
 */
async function makeApiCall(url, params, context, options = {}) {
  const { timeout = DEFAULT_STEAM_API_TIMEOUT_MS } = options;
  try {
    const response = await axios.get(url, { params, timeout });
    return response.data;
  } catch (error) {
    // Normaliser en SteamApiError pour que les callers puissent différencier
    // les erreurs "attendues" (403/404/429) des vraies pannes (5xx, timeout).
    const status = error.response?.status ?? null;
    const code = error.code ?? null;
    const steamError = new SteamApiError(error.message, {
      status,
      code,
      context,
      cause: error,
    });

    // Log léger ici (debug-only) : le caller loguera avec le bon niveau
    // (warn pour expected, error pour vraie panne) en fonction du contexte métier.
    logger.debug(
      { status, code, context, message: error.message },
      'steam_api_call_failed'
    );

    throw steamError;
  }
}

/**
 * Récupère les jeux possédés par un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Array>} - Liste des jeux
 */
async function fetchUserGames(steamId) {
  if (SIMULATION_CONFIG.privateProfile) {
    console.log('[LOCKED] [SIMULATION] Profil prive simule — fetchUserGames retourne []');
    return [];
  }

  const params = {
    key: STEAM_API_KEY,
    steamid: steamId,
    format: 'json',
    include_appinfo: true,
    include_played_free_games: true,
  };

  const data = await makeApiCall(ENDPOINTS.OWNED_GAMES, params, `getUserGames`);
  return data.response.games || [];
}

/**
 * Récupère les jeux récemment lancés (fenêtre Steam: 2 semaines).
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Array>} - Liste des jeux récents
 */
async function fetchRecentlyPlayedGames(steamId) {
  if (SIMULATION_CONFIG.privateProfile) {
    console.log('[LOCKED] [SIMULATION] Profil prive simule — fetchRecentlyPlayedGames retourne []');
    return [];
  }

  const params = {
    key: STEAM_API_KEY,
    steamid: steamId,
    format: 'json',
    count: 0, // 0 = comportement par défaut Steam (retourne la liste récente)
  };

  const data = await makeApiCall(
    ENDPOINTS.RECENTLY_PLAYED,
    params,
    `getRecentlyPlayedGames`
  );
  return data.response?.games || [];
}

/**
 * Récupère les actualités d'un jeu
 * @param {string} appId - ID de l'application
 * @param {Object} options - Options de la requête
 * @returns {Promise<Array>} - Liste des actualités
 */
async function fetchGameNews(appId, options = {}) {
  const {
    count = 5,
    maxLength = 0, // 0 = contenu complet (évite de tronquer les images/carousels)
    language = 'fr',
    steamOnly = true,
  } = options;
  const safeCount = Math.min(Math.max(Number(count) || 5, 1), 100);

  const params = {
    appid: appId,
    count: safeCount,
    maxlength: maxLength,
    format: 'json',
    language: toSteamNewsLanguage(language),
  };

  // Ajouter le filtre feeds si steamOnly est activé
  if (steamOnly) {
    params.feeds = 'steam_community_announcements,steam_updates';
  }

  // 5 s par appel : /api/news/feed parallélise N jeux et le mobile coupe à
  // 10 s — on veut échouer vite sur un jeu lent plutôt que bloquer le feed.
  const data = await makeApiCall(
    ENDPOINTS.GAME_NEWS,
    params,
    `getGameNews (${appId})`,
    { timeout: 5000 }
  );

  const allNews = data.appnews.newsitems || [];

  return allNews.slice(0, safeCount);
}

/**
 * Récupère le profil d'un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object|null>} - Profil utilisateur ou null
 */
async function fetchUserProfile(steamId) {
  const params = {
    key: STEAM_API_KEY,
    steamids: steamId,
    format: 'json',
  };

  const data = await makeApiCall(
    ENDPOINTS.PLAYER_SUMMARIES,
    params,
    `getUserProfile (${steamId})`
  );
  const players = data.response.players || [];
  const profile = players.length > 0 ? players[0] : null;

  if (profile && SIMULATION_CONFIG.privateProfile) {
    console.log('[LOCKED] [SIMULATION] Profil prive simule — communityvisibilitystate: 1');
    return { ...profile, communityvisibilitystate: 1 };
  }

  return profile;
}

/**
 * Récupère les détails d'un jeu depuis Steam Store API
 * ⚡ OPTIMISÉ : Timeout réduit pour requêtes plus rapides
 * @param {number} appId - ID du jeu
 * @returns {Promise<Object|null>} - Détails du jeu ou null
 */
async function fetchGameDetails(appId, language = 'fr') {
  try {
    const response = await axios.get(
      `https://store.steampowered.com/api/appdetails`,
      {
        params: {
          appids: appId,
          l: toSteamStoreLanguage(normalizeAppLanguage(language)),
        },
        timeout: 8000, // ⚡ 8 secondes max (augmenté pour éviter timeouts)
      }
    );

    const gameData = response.data[appId];
    if (gameData?.success && gameData?.data) {
      return {
        name: gameData.data.name,
        header_image: gameData.data.header_image,
        capsule_image: gameData.data.capsule_image,
        short_description: gameData.data.short_description,
        // Date de sortie supprimee
      };
    }
    return null;
  } catch (error) {
    // En cas d'erreur, retourner null sans bloquer
    return null;
  }
}

/**
 * Récupère la wishlist d'un utilisateur via l'API officielle Steam.
 * Cette méthode renvoie les données brutes de l'API (appid, date_added, priority).
 * L'enrichissement (noms, images) est géré côté service pour tirer parti du cache BDD.
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Array>} - Liste brute des jeux de la wishlist
 */
async function fetchUserWishlist(steamId) {
  if (SIMULATION_CONFIG.privateProfile) {
    console.log('[LOCKED] [SIMULATION] Profil prive simule — fetchUserWishlist retourne []');
    return [];
  }

  console.log('[INFO] Recuperation wishlist brute via API officielle Steam...');

  try {
    const params = {
      key: STEAM_API_KEY,
      steamid: steamId,
    };

    const data = await makeApiCall(
      ENDPOINTS.WISHLIST,
      params,
      `getUserWishlist`
    );

    const wishlistItems = data.response?.items || [];

    console.log(`[OK] Wishlist API recuperee : ${wishlistItems.length} jeux (brut)`);
    return wishlistItems.map((item) => ({
      appid: item.appid,
      date_added: item.date_added,
      priority: item.priority,
    }));
  } catch (error) {
    console.error('[ERROR] Erreur recuperation wishlist:', error.message);
    throw error;
  }
}

async function searchGames(query, limit = 5) {
  try {
    const response = await axios.get(
      `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(query)}`,
      {
        timeout: 5000,
      }
    );

    if (!response.data || !Array.isArray(response.data)) {
      return [];
    }

    const results = response.data.slice(0, limit).map((item) => ({
      appid: parseInt(item.appid),
      name: item.name,
      header_image: item.logo || `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.appid}/header.jpg`,
      tiny_image: item.icon || `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.appid}/capsule_sm_120.jpg`,
    }));

    return results;
  } catch (error) {
    console.error(`Erreur recherche jeux:`, error.message);
    return [];
  }
}

module.exports = {
  fetchUserGames,
  fetchRecentlyPlayedGames,
  fetchGameNews,
  fetchUserProfile,
  fetchUserWishlist,
  fetchGameDetails,
  searchGames,
  SteamApiError,
};
