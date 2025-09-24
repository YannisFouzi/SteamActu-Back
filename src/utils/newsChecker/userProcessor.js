/**
 * Processeur des utilisateurs pour les notifications
 * Gère l'envoi de notifications et la mise à jour des utilisateurs
 */

const User = require("../../models/User");
const notificationService = require("../../services/notificationService");

/**
 * Récupère un utilisateur éligible aux notifications
 * @param {string} steamId - Steam ID de l'utilisateur
 * @returns {Promise<Object|null>} - Utilisateur ou null
 */
async function getNotificationEligibleUser(steamId) {
  try {
    const user = await User.findOne({
      steamId,
      "notificationSettings.enabled": true,
      "notificationSettings.pushToken": { $exists: true, $ne: null },
    });

    return user;
  } catch (error) {
    console.error(`Erreur récupération utilisateur ${steamId}:`, error.message);
    return null;
  }
}

/**
 * Envoie des notifications à un utilisateur et met à jour lastChecked
 * @param {Object} user - Utilisateur destinataire
 * @param {string} gameId - ID du jeu
 * @param {Array} newNews - Nouvelles actualités
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function sendNotificationsToUser(user, gameId, newNews) {
  try {
    // Envoyer les notifications
    const notificationCount = await notificationService.sendNewsNotifications(
      user,
      {
        [gameId]: newNews,
      }
    );

    // Mettre à jour lastChecked pour l'utilisateur
    if (notificationCount > 0) {
      user.lastChecked = new Date();
      await user.save();
    }

    return notificationCount;
  } catch (error) {
    console.error(
      `Erreur envoi notifications à ${user.steamId}:`,
      error.message
    );
    return 0;
  }
}

/**
 * Traite tous les abonnés d'un jeu pour l'envoi de notifications
 * @param {Array} subscribers - Liste des Steam IDs abonnés
 * @param {string} gameId - ID du jeu
 * @param {Array} newNews - Nouvelles actualités
 * @returns {Promise<number>} - Nombre total de notifications envoyées
 */
async function processGameSubscribers(subscribers, gameId, newNews) {
  let totalNotifications = 0;

  for (const steamId of subscribers) {
    try {
      const user = await getNotificationEligibleUser(steamId);

      if (!user) {
        continue;
      }

      const notificationCount = await sendNotificationsToUser(
        user,
        gameId,
        newNews
      );
      totalNotifications += notificationCount;
    } catch (error) {
      console.error(`Erreur traitement abonné ${steamId}:`, error.message);
    }
  }

  return totalNotifications;
}

module.exports = {
  getNotificationEligibleUser,
  sendNotificationsToUser,
  processGameSubscribers,
};
