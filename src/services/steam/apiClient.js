/**
 * Client API Steam
 * Centralise les appels à l'API Steam avec gestion d'erreurs
 */

const axios = require('axios');
const { STEAM_CONFIG } = require('../../config/app');

const STEAM_API_KEY = STEAM_CONFIG.apiKey;
const STEAM_BASE_URL = STEAM_CONFIG.baseUrl;

// URLs des endpoints Steam
const ENDPOINTS = {
  OWNED_GAMES: `${STEAM_BASE_URL}/IPlayerService/GetOwnedGames/v0001/`,
  GAME_NEWS: `${STEAM_BASE_URL}/ISteamNews/GetNewsForApp/v0002/`,
  PLAYER_SUMMARIES: `${STEAM_BASE_URL}/ISteamUser/GetPlayerSummaries/v0002/`,
  WISHLIST: `${STEAM_BASE_URL}/IWishlistService/GetWishlist/v1/`,
};

/**
 * Effectue un appel API Steam avec gestion d'erreurs standardisée
 * @param {string} url - URL de l'endpoint
 * @param {Object} params - Paramètres de la requête
 * @param {string} context - Contexte pour les logs d'erreur
 * @returns {Promise<Object>} - Réponse de l'API
 */
async function makeApiCall(url, params, context) {
  try {
    const response = await axios.get(url, { params });
    return response.data;
  } catch (error) {
    console.error(`Erreur Steam API ${context}:`, error.message);
    throw error;
  }
}

/**
 * Récupère les jeux possédés par un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Array>} - Liste des jeux
 */
async function fetchUserGames(steamId) {
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
 * Récupère les actualités d'un jeu
 * @param {string} appId - ID de l'application
 * @param {Object} options - Options de la requête
 * @returns {Promise<Array>} - Liste des actualités
 */
async function fetchGameNews(appId, options = {}) {
  const {
    count = 5,
    maxLength = 300,
    language = 'fr',
    steamOnly = true,
  } = options;

  const params = {
    appid: appId,
    count,
    maxlength: maxLength,
    format: 'json',
    language,
  };

  // Ajouter le filtre feeds si steamOnly est activé
  if (steamOnly) {
    params.feeds = 'steam_community_announcements,steam_updates';
  }

  const data = await makeApiCall(
    ENDPOINTS.GAME_NEWS,
    params,
    `getGameNews (${appId})`
  );
  return data.appnews.newsitems || [];
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
  return players.length > 0 ? players[0] : null;
}

/**
 * Récupère les détails d'un jeu depuis Steam Store API
 * ⚡ OPTIMISÉ : Timeout réduit pour requêtes plus rapides
 * @param {number} appId - ID du jeu
 * @returns {Promise<Object|null>} - Détails du jeu ou null
 */
async function fetchGameDetails(appId) {
  try {
    const response = await axios.get(
      `https://store.steampowered.com/api/appdetails`,
      {
        params: { appids: appId, l: 'french' },
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
        // ❌ Date de sortie supprimée
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
  console.log(`📋 Récupération wishlist brute via API officielle Steam...`);

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

    console.log(`✅ Wishlist API récupérée : ${wishlistItems.length} jeux (brut)`);
    return wishlistItems.map((item) => ({
      appid: item.appid,
      date_added: item.date_added,
      priority: item.priority,
    }));
  } catch (error) {
    console.error(`❌ Erreur récupération wishlist:`, error.message);
    return [];
  }
}

async function searchGames(query, limit = 5) {
  try {
    const response = await axios.get(
      'https://store.steampowered.com/api/storesearch/',
      {
        params: {
          term: query,
          l: 'french',
          cc: 'fr',
        },
        timeout: 5000,
      }
    );

    if (!response.data || !response.data.items) {
      return [];
    }

    const results = response.data.items.slice(0, limit).map((item) => ({
      appid: parseInt(item.id),
      name: item.name,
      header_image: `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`,
      tiny_image: item.tiny_image || null,
    }));

    return results;
  } catch (error) {
    console.error(`Erreur recherche jeux:`, error.message);
    return [];
  }
}

module.exports = {
  fetchUserGames,
  fetchGameNews,
  fetchUserProfile,
  fetchUserWishlist,
  fetchGameDetails,
  searchGames,
};
