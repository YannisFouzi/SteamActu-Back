/**
 * Gestionnaire des GameSubscriptions
 */

const GameSubscription = require("../../models/GameSubscription");

/**
 * Ajoute un utilisateur à la subscription d'un jeu
 * @param {string} appId - ID de l'application
 * @param {string} steamId - ID Steam de l'utilisateur
 * @param {string} name - Nom du jeu
 * @param {string} imageUrl - URL de l'image du jeu
 * @returns {Promise<void>}
 */
async function addUserToGameSubscription(appId, steamId, name, imageUrl) {
  let gameSubscription = await GameSubscription.findOne({ gameId: appId });

  if (!gameSubscription) {
    // Créer nouvelle subscription pour ce jeu
    const firstFollowTimestamp = Math.floor(Date.now() / 1000);
    gameSubscription = new GameSubscription({
      gameId: appId,
      name: name || `Jeu ${appId}`,
      imageUrl: imageUrl || "",
      subscribers: [steamId],
      lastNewsTimestamp: firstFollowTimestamp,
    });
  } else {
    // Ajouter l'utilisateur aux subscribers s'il n'y est pas déjà
    if (!gameSubscription.subscribers.includes(steamId)) {
      gameSubscription.subscribers.push(steamId);
    }
    // Mettre à jour l'imageUrl si fournie
    if (imageUrl) {
      gameSubscription.imageUrl = imageUrl;
    }
  }

  await gameSubscription.save();
}

/**
 * Retire un utilisateur de la subscription d'un jeu
 * @param {string} appId - ID de l'application
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<boolean>} - True si la subscription a été supprimée
 */
async function removeUserFromGameSubscription(appId, steamId) {
  const gameSubscription = await GameSubscription.findOne({ gameId: appId });

  if (!gameSubscription) {
    return false;
  }

  // Retirer l'utilisateur des subscribers
  gameSubscription.subscribers = gameSubscription.subscribers.filter(
    (subscriber) => subscriber !== steamId
  );

  // Si plus aucun subscriber, supprimer le document
  if (gameSubscription.subscribers.length === 0) {
    await GameSubscription.deleteOne({ gameId: appId });
    return true; // Subscription supprimée
  } else {
    await gameSubscription.save();
    return false; // Subscription conservée
  }
}

module.exports = {
  addUserToGameSubscription,
  removeUserFromGameSubscription,
};
