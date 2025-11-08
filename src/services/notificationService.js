/**
 * Service de notifications push
 * Architecture modulaire prête pour l'évolution future
 */

const { getActiveProvider } = require('./notifications/providers');
require('./notifications/templates');

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

module.exports = {
  sendNotification,
};
