/**
 * Gestionnaire des utilisateurs Steam
 * Gère la création et mise à jour des utilisateurs dans la base de données
 */

const User = require('../../models/User');
const { fetchUserProfile } = require('./apiClient');

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
      console.log(`✅ User existant: ${user.username} (${steamId})`);
      return user;
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`🆕 NOUVEL UTILISATEUR - Création + Sync immédiate`);
    console.log(`${'='.repeat(70)}`);

    // Récupérer les informations du profil Steam
    const profileData = await fetchUserProfile(steamId);

    if (!profileData) {
      throw new Error(
        'Impossible de récupérer les informations du profil Steam'
      );
    }

    // Créer un nouvel utilisateur avec les données du profil
    user = new User({
      steamId,
      username: profileData.personaname || `Utilisateur ${steamId.slice(-4)}`,
      avatarUrl: profileData.avatarfull || null,
      followedGames: [],
      lastChecked: null, // Important : null pour permettre sync immédiate
    });

    await user.save();
    console.log(`✅ User créé: ${user.username} (${steamId})`);

    // ⚡ SYNC IMMÉDIATE des jeux pour nouvel utilisateur
    // L'utilisateur veut voir ses jeux immédiatement, pas attendre dimanche 3h !
    console.log(`⚡ Lancement sync immédiate des jeux...`);

    try {
      const { syncUserGames } = require('../gamesSync/userProcessor');
      const syncResult = await syncUserGames(user);

      if (syncResult.error) {
        console.error(`⚠️ Erreur sync jeux (non bloquant):`, syncResult.error);
      } else {
        console.log(
          `✅ Sync jeux réussie: ${
            syncResult.updatedGames?.length || 0
          } nouveaux jeux`
        );
      }
    } catch (syncError) {
      console.error(`⚠️ Erreur sync jeux (non bloquant):`, syncError.message);
      // On ne bloque pas l'inscription si la sync échoue
    }

    // NOTE: Wishlist sync désactivée à la connexion (trop lent)

    // Recharger le user pour avoir les données à jour (après sync games)
    user = await User.findOne({ steamId });

    console.log(`${'='.repeat(70)}\n`);

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
