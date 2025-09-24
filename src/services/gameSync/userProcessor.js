/**
 * Processeur pour la synchronisation des jeux utilisateur
 */

const steamService = require("../steamService");

// 6 heures en millisecondes
const SYNC_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Vérifie si un utilisateur peut être synchronisé
 * @param {Object} user - Utilisateur
 * @returns {boolean} - True si la synchronisation est possible
 */
function canSyncUser(user) {
  const cooldownTime = new Date(Date.now() - SYNC_COOLDOWN_MS);
  const lastSyncTime = user.lastChecked || new Date(0);

  return lastSyncTime <= cooldownTime;
}

/**
 * Migre et normalise la structure followedGames
 * @param {Object} user - Utilisateur
 * @returns {Set} - Set des IDs de jeux suivis
 */
function normalizeFollowedGames(user) {
  const followedGamesSet = new Set();

  if (user.followedGames && Array.isArray(user.followedGames)) {
    user.followedGames.forEach((game) => {
      if (typeof game === "string") {
        // Nouvelle structure : juste l'appId
        followedGamesSet.add(game);
      } else if (game && game.appId) {
        // Ancienne structure : objet avec appId
        followedGamesSet.add(game.appId);
      }
    });
  }

  return followedGamesSet;
}

/**
 * Traite l'auto-follow des nouveaux jeux
 * @param {Object} user - Utilisateur
 * @param {Array} userGames - Jeux Steam de l'utilisateur
 * @param {Set} followedGamesSet - Jeux actuellement suivis
 * @returns {Object} - Résultat du traitement
 */
function processAutoFollow(user, userGames, followedGamesSet) {
  const updatedFollowedGames = Array.from(followedGamesSet);
  const newGames = [];
  let hasNewFollowedGames = false;

  // Vérifier si l'auto-follow est activé
  const autoFollowEnabled = user.notificationSettings?.autoFollowNewGames;

  if (autoFollowEnabled) {
    for (const game of userGames) {
      const appId = game.appid.toString();

      if (!followedGamesSet.has(appId)) {
        updatedFollowedGames.push(appId);
        hasNewFollowedGames = true;

        newGames.push({
          appId,
          name: game.name,
          action: "auto-followed",
        });
      }
    }
  }

  return {
    updatedFollowedGames,
    newGames,
    hasNewFollowedGames,
  };
}

/**
 * Crée l'objet de résultat pour un utilisateur
 * @param {Object} user - Utilisateur
 * @returns {Object} - Objet de résultat
 */
function createUserResult(user) {
  return {
    userId: user._id,
    steamId: user.steamId,
    username: user.username,
    updatedGames: [],
    error: null,
    lastSyncTime: new Date(),
  };
}

/**
 * Synchronise les jeux d'un utilisateur spécifique
 * @param {Object} user - Utilisateur
 * @returns {Promise<Object>} - Résultat de synchronisation
 */
async function syncUserGames(user) {
  const result = createUserResult(user);

  try {
    console.log(
      `Synchronisation des jeux pour ${user.username} (${user.steamId})`
    );

    // Vérifier le cooldown
    if (!canSyncUser(user)) {
      const lastSyncTime = user.lastChecked || new Date(0);
      console.log(
        `Utilisateur ${
          user.username
        } synchronisé récemment (${lastSyncTime.toISOString()}), en attente.`
      );
      return {
        ...result,
        skipped: true,
        message: "Synchronisation récente, ignorée",
      };
    }

    // Récupérer les jeux Steam
    const userGames = await steamService.getUserGames(user.steamId);

    if (!userGames || !Array.isArray(userGames)) {
      console.error(`Réponse invalide de l'API Steam pour ${user.username}`);
      result.error = "Réponse invalide de l'API Steam";
      return result;
    }

    // Normaliser les jeux suivis
    const followedGamesSet = normalizeFollowedGames(user);

    // Traiter l'auto-follow
    const autoFollowResult = processAutoFollow(
      user,
      userGames,
      followedGamesSet
    );

    result.updatedGames = autoFollowResult.newGames;

    // Mettre à jour l'utilisateur si nécessaire
    if (autoFollowResult.hasNewFollowedGames) {
      user.followedGames = autoFollowResult.updatedFollowedGames;
      console.log(
        `${result.updatedGames.length} jeux auto-suivis pour ${user.username}`
      );
    }

    // Mettre à jour la date de dernière vérification
    user.lastChecked = new Date();
    await user.save();

    return result;
  } catch (error) {
    console.error(
      `Erreur lors de la synchronisation des jeux pour ${user.username}:`,
      error
    );
    result.error = error.message;
    return result;
  }
}

module.exports = {
  syncUserGames,
  canSyncUser,
  normalizeFollowedGames,
  processAutoFollow,
};
