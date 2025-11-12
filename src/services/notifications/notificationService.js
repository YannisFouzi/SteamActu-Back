/**
 * Service de notifications push
 * Architecture modulaire prête pour l'évolution future
 */

const { getActiveProvider } = require('./providers');
const { createNewsNotification, createFollowPromptNotification } = require('./templates');
const User = require('../../models/User');

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
 * Envoie une notification de nouvelle actualité à un utilisateur
 * @param {string} steamId - Steam ID de l'utilisateur
 * @param {string} appId - ID de l'application Steam
 * @param {string} gameName - Nom du jeu
 * @param {string} newsTitle - Titre de la news
 * @param {string} newsUrl - URL de la news Steam
 * @param {string} newsGid - GID de la news (identifiant unique Steam)
 * @returns {Promise<boolean>} - Succès de l'envoi
 */
async function sendNewsNotification(
  steamId,
  appId,
  gameName,
  newsTitle,
  newsUrl,
  newsGid
) {
  try {
    // Récupérer l'utilisateur depuis MongoDB
    const user = await User.findOne({ steamId }).lean();

    if (!user) {
      console.warn(`[Notification] User ${steamId} introuvable`);
      return false;
    }

    // Vérifier que les notifications sont activées
    // Note: undefined ou true = enabled, seul false = disabled
    // Cela permet aux anciens users (sans notificationSettings) de recevoir des notifs
    if (!user.notificationSettings?.newsNotifications) {
      console.log(`[Notification] Notifications news désactivées pour ${steamId}`);
      return false;
    }

    // Récupérer les tokens FCM
    const fcmTokens = user.notificationSettings?.fcmTokens || [];

    if (fcmTokens.length === 0) {
      console.log(`[Notification] Aucun token FCM pour ${steamId}`);
      return false;
    }

    // Extraire uniquement les tokens (string[])
    const tokens = fcmTokens.map((t) => t.token);

    // Créer la notification avec le template
    const notification = createNewsNotification(
      appId,
      { title: newsTitle, url: newsUrl, gid: newsGid },
      gameName
    );

    // Envoyer via le provider actif
    const provider = getActiveProvider();
    const result = await provider(tokens, notification);

    // Gérer les tokens invalides (auto-cleanup)
    if (result && typeof result === 'object' && result.invalidTokens) {
      console.log(
        `[Notification] Nettoyage de ${result.invalidTokens.length} token(s) invalide(s)`
      );

      // Supprimer les tokens invalides de la DB
      await User.updateOne(
        { steamId },
        {
          $pull: {
            'notificationSettings.fcmTokens': {
              token: { $in: result.invalidTokens },
            },
          },
        }
      );

      return result.success;
    }

    return Boolean(result);
  } catch (error) {
    console.error(
      `[Notification] Erreur envoi news à ${steamId}:`,
      error.message
    );
    return false;
  }
}

/**
 * Envoie une ou plusieurs notifications de suivi manuel pour des jeux détectés
 * @param {string} steamId - Steam ID de l'utilisateur
 * @param {Array} prompts - Jeux détectés nécessitant confirmation
 * @returns {Promise<number>} - Nombre de notifications envoyées avec succès
 */
async function sendFollowPromptNotifications(steamId, prompts = []) {
  try {
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return 0;
    }

    const user = await User.findOne({ steamId }).lean();

    if (!user) {
      console.warn(`[Notification] User ${steamId} introuvable pour follow_prompt`);
      return 0;
    }

    if (!user.notificationSettings?.followPromptNotifications) {
      console.log(
        `[Notification] Notifications follow_prompt désactivées pour ${steamId}`
      );
      return 0;
    }

    const fcmTokens = user.notificationSettings?.fcmTokens || [];

    if (fcmTokens.length === 0) {
      console.log(`[Notification] Aucun token FCM pour ${steamId} (follow_prompt)`);
      return 0;
    }

    let activeTokens = fcmTokens.map((t) => t.token);
    const provider = getActiveProvider();
    let sentCount = 0;

    for (const prompt of prompts) {
      if (activeTokens.length === 0) {
        break;
      }

      const notification = createFollowPromptNotification(
        prompt.appId,
        prompt.name,
        prompt.source || 'library'
      );

      notification.data = {
        ...notification.data,
        imageUrl: prompt.imageUrl || '',
        allowUnfollow: '0',
      };

      const result = await provider(activeTokens, notification);

      if (result && typeof result === 'object' && result.invalidTokens) {
        const invalidTokens = result.invalidTokens;

        if (invalidTokens.length > 0) {
          console.log(
            `[Notification] Nettoyage de ${invalidTokens.length} token(s) invalide(s) (follow_prompt)`
          );

          await User.updateOne(
            { steamId },
            {
              $pull: {
                'notificationSettings.fcmTokens': {
                  token: { $in: invalidTokens },
                },
              },
            }
          );

          const invalidSet = new Set(invalidTokens);
          activeTokens = activeTokens.filter((token) => !invalidSet.has(token));
        }

        if (result.success) {
          sentCount++;
        }
      } else if (result) {
        sentCount++;
      }
    }

    return sentCount;
  } catch (error) {
    console.error(
      `[Notification] Erreur envoi follow_prompt à ${steamId}:`,
      error.message
    );
    return 0;
  }
}

module.exports = {
  sendNotification,
  sendNewsNotification,
  sendFollowPromptNotifications,
};
