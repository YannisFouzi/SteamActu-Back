/**
 * Gestionnaire des utilisateurs Steam
 * Gère la création et mise à jour des utilisateurs dans la base de données
 */

const User = require("../../models/User");
const { fetchUserProfile } = require("./apiClient");

/**
 * Enregistre ou met à jour un utilisateur dans la base de données
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object>} - Utilisateur enregistré
 */
async function registerOrUpdateUser(steamId) {
  try {
    // Vérifier si l'utilisateur existe déjà
    let user = await User.findOne({ steamId });

    if (user) {
      // L'utilisateur existe déjà, le retourner
      return user;
    }

    // Récupérer les informations du profil Steam
    const profileData = await fetchUserProfile(steamId);

    if (!profileData) {
      throw new Error(
        "Impossible de récupérer les informations du profil Steam"
      );
    }

    // Créer un nouvel utilisateur avec les données du profil
    user = new User({
      steamId,
      username: profileData.personaname || `Utilisateur ${steamId.slice(-4)}`,
      avatarUrl: profileData.avatarfull || null,
      followedGames: [],
    });

    await user.save();
    return user;
  } catch (error) {
    console.error(`Erreur registerOrUpdateUser (${steamId}):`, error.message);
    throw error;
  }
}

/**
 * Met à jour le profil d'un utilisateur existant
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object|null>} - Utilisateur mis à jour ou null
 */
async function updateUserProfile(steamId) {
  try {
    const user = await User.findOne({ steamId });
    if (!user) {
      return null;
    }

    const profileData = await fetchUserProfile(steamId);
    if (!profileData) {
      return user; // Retourner l'utilisateur existant si pas de données
    }

    // Mettre à jour les informations
    user.username = profileData.personaname || user.username;
    user.avatarUrl = profileData.avatarfull || user.avatarUrl;

    await user.save();
    return user;
  } catch (error) {
    console.error(`Erreur updateUserProfile (${steamId}):`, error.message);
    throw error;
  }
}

module.exports = {
  registerOrUpdateUser,
  updateUserProfile,
};
