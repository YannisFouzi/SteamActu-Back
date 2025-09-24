/**
 * Service de notifications push
 * Architecture modulaire prête pour l'évolution future
 */

const { getActiveProvider } = require("./notifications/providers");
const { createNewsNotification } = require("./notifications/templates");

/**
 * Envoie une notification à un utilisateur
 * @param {string} token - Token de notification push du périphérique
 * @param {Object} notification - Détails de la notification
 * @param {string} notification.title - Titre de la notification
 * @param {string} notification.body - Contenu de la notification
 * @param {Object} notification.data - Données supplémentaires pour la notification
 * @returns {Promise<boolean>} - Succès de l'envoi
 */
async function sendNotification(token, notification) {
  try {
    if (!token || !notification) {
      return false;
    }

    const provider = getActiveProvider();
    return await provider(token, notification);
  } catch (error) {
    console.error("Erreur lors de l'envoi de la notification:", error);
    return false;
  }
}

/**
 * Envoie des notifications pour de nouvelles actualités
 * @param {Object} user - Utilisateur à notifier
 * @param {Object} newsItems - Actualités à notifier, regroupées par jeu
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function sendNewsNotifications(user, newsItems) {
  try {
    const { pushToken } = user.notificationSettings;

    if (!pushToken) {
      return 0;
    }

    let notificationCount = 0;

    // Pour chaque jeu ayant des nouvelles actualités
    for (const [appId, news] of Object.entries(newsItems)) {
      // Vérifier si l'utilisateur suit ce jeu
      const isFollowed = user.followedGames.includes(appId);

      if (!isFollowed) continue;

      // Pour chaque actualité du jeu
      for (const item of news) {
        const notification = createNewsNotification(appId, item);
        const success = await sendNotification(pushToken, notification);

        if (success) {
          notificationCount++;
        }
      }
    }

    return notificationCount;
  } catch (error) {
    console.error("Erreur lors de l'envoi des notifications:", error);
    return 0;
  }
}

module.exports = {
  sendNotification,
  sendNewsNotifications,
};
