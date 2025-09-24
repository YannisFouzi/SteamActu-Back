/**
 * Client API Steam
 * Centralise les appels à l'API Steam avec gestion d'erreurs
 */

const axios = require("axios");
require("dotenv").config();

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_BASE_URL = "http://api.steampowered.com";

// URLs des endpoints Steam
const ENDPOINTS = {
  OWNED_GAMES: `${STEAM_BASE_URL}/IPlayerService/GetOwnedGames/v0001/`,
  GAME_NEWS: `${STEAM_BASE_URL}/ISteamNews/GetNewsForApp/v0002/`,
  PLAYER_SUMMARIES: `${STEAM_BASE_URL}/ISteamUser/GetPlayerSummaries/v0002/`,
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
    format: "json",
    include_appinfo: true,
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
    language = "fr",
    steamOnly = true,
  } = options;

  const params = {
    appid: appId,
    count,
    maxlength: maxLength,
    format: "json",
    language,
  };

  // Ajouter le filtre feeds si steamOnly est activé
  if (steamOnly) {
    params.feeds = "steam_community_announcements,steam_updates";
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
    format: "json",
  };

  const data = await makeApiCall(
    ENDPOINTS.PLAYER_SUMMARIES,
    params,
    `getUserProfile (${steamId})`
  );
  const players = data.response.players || [];
  return players.length > 0 ? players[0] : null;
}

module.exports = {
  fetchUserGames,
  fetchGameNews,
  fetchUserProfile,
};
