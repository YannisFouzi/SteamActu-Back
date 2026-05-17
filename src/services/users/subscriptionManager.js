/**
 * Gestionnaire des GameSubscriptions
 */

const GameSubscription = require('../../models/GameSubscription');
const { getGameImage } = require('../steamGridDbService');

// Noms génériques injectés par d'anciens scripts de test ou quand Steam ne renvoie
// pas le vrai titre (cas "Unknown Game" pour les jeux pré-release vus via Family
// Sharing). Détectés pour permettre l'auto-correction au prochain follow.
// Synchronisé avec PLACEHOLDER_NAME_PATTERN de gamesSync/userProcessor.js.
const PLACEHOLDER_NAME_PATTERN = /^((Test Game|Jeu|Game)\s+\d+|Unknown Game)$/i;

function isPlaceholderName(name) {
  if (!name || typeof name !== 'string') return true;
  return PLACEHOLDER_NAME_PATTERN.test(name.trim());
}

/**
 * Ajoute un utilisateur à la subscription d'un jeu
 * @param {string} appId - ID de l'application
 * @param {string} steamId - ID Steam de l'utilisateur
 * @param {string} name - Nom du jeu
 * @param {string} imageUrl - URL de l'image du jeu
 * @returns {Promise<void>}
 */
async function addUserToGameSubscription(appId, steamId, name, imageUrl) {
  // Le nom est passé au resolver pour activer le 5ème étage SteamGridDB
  // (search par nom, utile pour les jeux pré-release non liés à l'appId).
  const gridDbIcon = await getGameImage(appId, name).catch(() => null);
  const bestImageUrl = gridDbIcon || imageUrl || '';
  const firstFollowTimestamp = Math.floor(Date.now() / 1000);

  // Upsert atomique : crée le doc s'il n'existe pas, sinon ajoute juste le subscriber.
  // Garantit qu'il est impossible de créer deux documents en parallèle pour le même jeu
  // (race condition si deux users cliquent "follow" exactement au même moment).
  const gameSubscription = await GameSubscription.findOneAndUpdate(
    { gameId: appId },
    {
      $setOnInsert: {
        gameId: appId,
        name: name || `Jeu ${appId}`,
        imageUrl: bestImageUrl,
        lastNewsTimestamp: firstFollowTimestamp,
      },
      $addToSet: { subscribers: steamId },
    },
    { upsert: true, new: true }
  );

  // Corrections conditionnelles pour un doc pré-existant (l'upsert ne met pas à jour
  // ces champs via $setOnInsert). On fait un second update ciblé uniquement si utile.
  const updates = {};
  if (gridDbIcon && gameSubscription.imageUrl !== bestImageUrl) {
    updates.imageUrl = bestImageUrl;
  } else if (imageUrl && !gameSubscription.imageUrl) {
    updates.imageUrl = bestImageUrl;
  }
  // Auto-correction du nom : si l'actuel est un placeholder générique
  // (ex. "Test Game 3834090" injecté par d'anciens scripts) et que le nouveau
  // est un titre propre, on remplace. Les noms custom valides ne sont jamais écrasés.
  if (name && !isPlaceholderName(name) && isPlaceholderName(gameSubscription.name)) {
    updates.name = name.trim();
  }

  if (Object.keys(updates).length > 0) {
    await GameSubscription.updateOne({ gameId: appId }, { $set: updates });
  }
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
