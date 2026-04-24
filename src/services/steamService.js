/**
 * Service Steam principal
 * Interface publique pour les interactions avec Steam API
 */

const {
  fetchUserGames,
  fetchRecentlyPlayedGames,
  fetchGameNews,
  fetchUserProfile,
  fetchUserWishlist,
  searchGames: fetchSearchGames,
  SteamApiError,
} = require('./steam/apiClient');
const { registerOrUpdateUser } = require('./steam/steamUserManager');

/**
 * Récupère la liste des jeux possédés par un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Array>} Liste des jeux
 */
async function getUserGames(steamId) {
  return fetchUserGames(steamId);
}

/**
 * Récupère les jeux récemment lancés (2 semaines) d'un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Array>} Liste des jeux récents
 */
async function getRecentlyPlayedGames(steamId) {
  return fetchRecentlyPlayedGames(steamId);
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
  maxLength = 0, // 0 = contenu complet (évite de tronquer les images/carousels)
  language = 'fr',
  steamOnly = true
) {
  return fetchGameNews(appId, { count, maxLength, language, steamOnly });
}

/**
 * Récupère les informations publiques d'un profil Steam
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object>} Informations du profil
 */
async function getUserProfile(steamId) {
  return fetchUserProfile(steamId);
}

/**
 * Récupère la wishlist d'un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Array>} Liste des jeux de la wishlist
 */
async function getUserWishlist(steamId) {
  return fetchUserWishlist(steamId);
}

async function searchGames(query, limit = 5) {
  return fetchSearchGames(query, limit);
}

module.exports = {
  getUserGames,
  getRecentlyPlayedGames,
  getGameNews,
  getUserProfile,
  registerOrUpdateUser,
  getUserWishlist,
  searchGames,
  SteamApiError,
};
