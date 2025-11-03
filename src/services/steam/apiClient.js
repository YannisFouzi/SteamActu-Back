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
    format: "json",
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
        params: { appids: appId, l: "french" },
        timeout: 3000, // ⚡ 3 secondes max (réduit de 5s)
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
 * Récupère les détails de plusieurs jeux en une seule requête (BATCH)
 * ⚡ OPTIMISATION : Teste différents formats pour l'API Steam
 * @param {Array<number>} appIds - Liste des IDs de jeux
 * @returns {Promise<Object>} - Map {appId: détails} ou {appId: null} si erreur
 */
async function fetchGameDetailsBatch(appIds) {
  if (!appIds || appIds.length === 0) {
    return {};
  }

  try {
    // 🧪 TEST : Construire l'URL avec appids séparés par des virgules
    const appIdsString = appIds.join(",");

    console.log(
      `🧪 TEST Batch API - Tentative avec ${
        appIds.length
      } jeux: ${appIdsString.substring(0, 50)}...`
    );

    const response = await axios.get(
      `https://store.steampowered.com/api/appdetails`,
      {
        params: {
          appids: appIdsString,
          l: "french",
        },
        timeout: 15000, // 15 secondes pour un batch
      }
    );

    console.log(`✅ Réponse reçue, parsing...`);

    const results = {};

    // Parser la réponse pour chaque jeu
    appIds.forEach((appId) => {
      const gameData = response.data[appId];

      if (gameData?.success && gameData?.data) {
        results[appId] = {
          name: gameData.data.name,
          header_image: gameData.data.header_image,
          capsule_image: gameData.data.capsule_image,
          short_description: gameData.data.short_description,
          release_date: gameData.data.release_date?.date || "",
        };
        console.log(`   ✅ ${appId}: ${gameData.data.name}`);
      } else {
        // Jeu non trouvé ou erreur
        results[appId] = null;
        console.log(`   ❌ ${appId}: Pas de données`);
      }
    });

    return results;
  } catch (error) {
    console.error(
      `❌ Erreur fetchGameDetailsBatch (${appIds.length} jeux):`,
      error.message
    );
    console.error(
      `   URL tentée: https://store.steampowered.com/api/appdetails?appids=${appIds
        .join(",")
        .substring(0, 100)}...`
    );

    // En cas d'erreur, retourner un objet avec null pour chaque appId
    const results = {};
    appIds.forEach((appId) => {
      results[appId] = null;
    });
    return results;
  }
}

/**
 * Récupère la wishlist d'un utilisateur via l'API officielle Steam
 * et enrichit avec les noms des jeux (OPTIMISÉ avec appels parallèles)
 * ⚡ PERFORMANCE : 5 jeux en parallèle → 94 jeux en ~19 batches (3-4 secondes)
 * ⚠️ Note : L'API Steam ne supporte PAS les batch avec plusieurs appids
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Array>} - Liste des jeux de la wishlist
 */
async function fetchUserWishlist(steamId) {
  console.log(`📋 Récupération wishlist via API officielle Steam...`);

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

    // Les données sont dans response.items
    const wishlistItems = data.response?.items || [];

    console.log(`✅ Wishlist API récupérée : ${wishlistItems.length} jeux`);

    if (wishlistItems.length === 0) {
      return [];
    }

    // ⚡ OPTIMISATION : 5 jeux en parallèle pour éviter rate limit Steam
    // L'API Steam ne supporte PAS les appels batch → appels individuels en parallèle
    const PARALLEL_REQUESTS = 5;
    const enrichedItems = [];
    const totalBatches = Math.ceil(wishlistItems.length / PARALLEL_REQUESTS);

    console.log(
      `⚡ Enrichissement optimisé: ${PARALLEL_REQUESTS} jeux en parallèle...`
    );

    for (let i = 0; i < wishlistItems.length; i += PARALLEL_REQUESTS) {
      const batch = wishlistItems.slice(i, i + PARALLEL_REQUESTS);

      // 🚀 Traiter 5 jeux EN PARALLÈLE (appels individuels simultanés)
      const batchPromises = batch.map(async (item) => {
        const details = await fetchGameDetails(item.appid);

        return {
          appid: item.appid,
          name: details?.name || `Game ${item.appid}`,
          date_added: item.date_added,
          priority: item.priority,
          capsule:
            details?.capsule_image ||
            `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.appid}/capsule_231x87.jpg`,
          header_image:
            details?.header_image ||
            `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.appid}/header.jpg`,
          review_score: 0,
          review_desc: "",
          reviews_percent: 0,
          // ❌ Date de sortie supprimée (pas utile pour la wishlist)
        };
      });

      const batchResults = await Promise.all(batchPromises);
      enrichedItems.push(...batchResults);

      // Log de progression
      const batchNumber = Math.floor(i / PARALLEL_REQUESTS) + 1;
      console.log(
        `   ⚡ Batch ${batchNumber}/${totalBatches} : ${enrichedItems.length}/${wishlistItems.length} jeux`
      );
    }

    console.log(
      `✅ Wishlist enrichie : ${enrichedItems.length} jeux avec noms réels`
    );
    return enrichedItems;
  } catch (error) {
    console.error(`❌ Erreur récupération wishlist:`, error.message);
    return [];
  }
}

async function searchGames(query, limit = 5) {
  try {
    const response = await axios.get(
      "https://store.steampowered.com/api/storesearch/",
      {
        params: {
          term: query,
          l: "french",
          cc: "fr",
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
  searchGames,
};
