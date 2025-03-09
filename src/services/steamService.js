const axios = require("axios");
require("dotenv").config();

const STEAM_API_KEY = process.env.STEAM_API_KEY;

/**
 * Récupère la liste des jeux possédés par un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Array>} Liste des jeux
 */
async function getUserGames(steamId) {
  try {
    const response = await axios.get(
      `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/`,
      {
        params: {
          key: STEAM_API_KEY,
          steamid: steamId,
          format: "json",
          include_appinfo: true,
        },
      }
    );

    return response.data.response.games || [];
  } catch (error) {
    console.error("Erreur lors de la récupération des jeux:", error.message);
    throw error;
  }
}

/**
 * Récupère les actualités d'un jeu spécifique
 * @param {string} appId - ID de l'application Steam
 * @param {number} count - Nombre d'actualités à récupérer
 * @param {number} maxLength - Longueur maximale du contenu
 * @param {string} language - Langue des actualités
 * @param {boolean} steamOnly - Filtrer les actualités uniquement hébergées sur Steam
 * @returns {Promise<Array>} Liste des actualités
 */
async function getGameNews(
  appId,
  count = 5,
  maxLength = 300,
  language = "fr",
  steamOnly = true
) {
  try {
    const params = {
      appid: appId,
      count: count,
      maxlength: maxLength,
      format: "json",
      language: language,
    };

    // Ajouter le filtre feeds si steamOnly est activé
    if (steamOnly) {
      params.feeds = "steam_community_announcements,steam_updates";
    }

    const response = await axios.get(
      `http://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/`,
      { params }
    );

    return response.data.appnews.newsitems || [];
  } catch (error) {
    console.error(
      `Erreur lors de la récupération des actualités:`,
      error.message
    );
    throw error;
  }
}

/**
 * Récupère les informations publiques d'un profil Steam
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object>} Informations du profil
 */
async function getUserProfile(steamId) {
  try {
    const response = await axios.get(
      `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/`,
      {
        params: {
          key: STEAM_API_KEY,
          steamids: steamId,
          format: "json",
        },
      }
    );

    const players = response.data.response.players || [];
    return players.length > 0 ? players[0] : null;
  } catch (error) {
    console.error("Erreur lors de la récupération du profil:", error.message);
    throw error;
  }
}

module.exports = {
  getUserGames,
  getGameNews,
  getUserProfile,
};
