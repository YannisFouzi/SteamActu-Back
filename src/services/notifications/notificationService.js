/**
 * Service de notifications push
 * Architecture modulaire prete pour l'evolution future
 */

const { getActiveProvider } = require('./providers');
const { createNewsNotification, createFollowPromptNotification } = require('./templates');
const User = require('../../models/User');
const GameSubscription = require('../../models/GameSubscription');
const logger = require('../../utils/logger');

/**
 * Envoie une notification a un utilisateur
 * @param {string} token - Token de notification push du peripherique
 * @param {Object} notification - Details de la notification
 * @param {string} notification.title - Titre de la notification
 * @param {string} notification.body - Contenu de la notification
 * @param {Object} notification.data - Donnees supplementaires pour la notification
 * @returns {Promise<boolean>} - Succes de l'envoi
 */
async function sendNotification(token, notification) {
  try {
    if (!token || !notification) {
      return false;
    }

    const provider = getActiveProvider();
    return await provider(token, notification);
  } catch (error) {
    logger.error({ err: error }, 'notification_send_failed');
    return false;
  }
}

/**
 * Envoie une notification de nouvelle actualite a un utilisateur
 * @param {string} steamId - Steam ID de l'utilisateur
 * @param {string} appId - ID de l'application Steam
 * @param {string} gameName - Nom du jeu
 * @param {string} newsTitle - Titre de la news
 * @param {string} newsUrl - URL de la news Steam
 * @param {string} newsGid - GID de la news (identifiant unique Steam)
 * @param {string|null} firstImageUrl - Premiere image detectee dans la news
 * @returns {Promise<boolean>} - Succes de l'envoi
 */
async function sendNewsNotification(
  steamId,
  appId,
  gameName,
  newsTitle,
  newsUrl,
  newsGid,
  firstImageUrl = null
) {
  try {
    const user = await User.findOne({ steamId }).lean();

    if (!user) {
      logger.warn({ steamId }, 'news_notification_user_not_found');
      return false;
    }

    // Note: undefined ou true = enabled, seul false = disabled
    // Cela permet aux anciens users (sans notificationSettings) de recevoir des notifs
    if (!user.notificationSettings?.newsNotifications) {
      logger.debug({ steamId }, 'news_notification_disabled');
      return false;
    }

    const fcmTokens = user.notificationSettings?.fcmTokens || [];

    if (fcmTokens.length === 0) {
      logger.debug({ steamId }, 'news_notification_no_fcm_token');
      return false;
    }

    const tokens = fcmTokens.map((t) => t.token);
    const language = user.language || 'fr';

    // Logo du jeu (fallback largeIcon côté frontend quand la news n'a pas d'image)
    let gameLogoUrl = null;
    try {
      const sub = await GameSubscription.findOne({ gameId: String(appId) })
        .select('imageUrl')
        .lean();
      gameLogoUrl = sub?.imageUrl || null;
    } catch (_) {
      // pas bloquant
    }

    const notification = createNewsNotification(
      appId,
      {
        title: newsTitle,
        url: newsUrl,
        gid: newsGid,
        firstImageUrl,
        gameLogoUrl,
      },
      gameName,
      steamId,
      language
    );

    const provider = getActiveProvider();
    const result = await provider(tokens, notification);

    // Gerer les tokens invalides (auto-cleanup)
    if (result && typeof result === 'object' && result.invalidTokens) {
      logger.info(
        { steamId, count: result.invalidTokens.length },
        'fcm_invalid_tokens_cleanup'
      );

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
    logger.error(
      { err: error, steamId, appId },
      'news_notification_failed'
    );
    return false;
  }
}

/**
 * Envoie une ou plusieurs notifications de suivi manuel pour des jeux detectes
 * @param {string} steamId - Steam ID de l'utilisateur
 * @param {Array} prompts - Jeux detectes necessitant confirmation
 * @returns {Promise<number>} - Nombre de notifications envoyees avec succes
 */
async function sendFollowPromptNotifications(steamId, prompts = []) {
  try {
    if (!Array.isArray(prompts) || prompts.length === 0) {
      return 0;
    }

    const user = await User.findOne({ steamId }).lean();

    if (!user) {
      logger.warn({ steamId }, 'follow_prompt_user_not_found');
      return 0;
    }

    if (!user.notificationSettings?.followPromptNotifications) {
      logger.debug({ steamId }, 'follow_prompt_disabled');
      return 0;
    }

    const fcmTokens = user.notificationSettings?.fcmTokens || [];

    if (fcmTokens.length === 0) {
      logger.debug({ steamId }, 'follow_prompt_no_fcm_token');
      return 0;
    }

    let activeTokens = fcmTokens.map((t) => t.token);
    const provider = getActiveProvider();
    let sentCount = 0;
    const language = user.language || 'fr';

    for (const prompt of prompts) {
      if (activeTokens.length === 0) {
        break;
      }

      const notification = createFollowPromptNotification(
        prompt.appId,
        prompt.name,
        prompt.source || 'library',
        language,
        steamId
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
          logger.info(
            { steamId, count: invalidTokens.length, kind: 'follow_prompt' },
            'fcm_invalid_tokens_cleanup'
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
    logger.error(
      { err: error, steamId },
      'follow_prompt_notification_failed'
    );
    return 0;
  }
}

module.exports = {
  sendNotification,
  sendNewsNotification,
  sendFollowPromptNotifications,
};
