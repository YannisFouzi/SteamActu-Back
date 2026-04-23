/**
 * Providers de notifications push
 * Architecture prete pour les implementations futures
 */

const { NOTIFICATION_CONFIG } = require('../../config/app');
const logger = require('../../utils/logger');
const path = require('path');
const fs = require('fs');

// Firebase Admin - Initialisation lazy
let firebaseAdmin = null;
let isFirebaseInitialized = false;

/**
 * Initialise Firebase Admin SDK (une seule fois)
 * @returns {boolean} - Succès de l'initialisation
 */
function initializeFirebase() {
  if (isFirebaseInitialized) {
    return firebaseAdmin !== null;
  }

  try {
    const admin = require('firebase-admin');

    let serviceAccount = null;

    // MODE 1 : Charger depuis variable d'environnement (PRODUCTION - Railway)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      logger.info({ source: 'env' }, 'firebase_credentials_loading');
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        logger.info({ source: 'env' }, 'firebase_credentials_loaded');
      } catch (parseError) {
        logger.error(
          { err: parseError, source: 'env' },
          'firebase_credentials_parse_failed'
        );
        isFirebaseInitialized = true;
        return false;
      }
    }
    // MODE 2 : Charger depuis fichier local (DEVELOPMENT - Local)
    else if (NOTIFICATION_CONFIG.firebaseServiceAccountPath) {
      logger.info({ source: 'file' }, 'firebase_credentials_loading');

      const serviceAccountPath = path.resolve(
        process.cwd(),
        NOTIFICATION_CONFIG.firebaseServiceAccountPath
      );

      if (!fs.existsSync(serviceAccountPath)) {
        logger.error(
          { path: serviceAccountPath },
          'firebase_service_account_not_found'
        );
        isFirebaseInitialized = true;
        return false;
      }

      serviceAccount = require(serviceAccountPath);
      logger.info({ source: 'file' }, 'firebase_credentials_loaded');
    }
    // Aucune méthode disponible
    else {
      logger.warn('firebase_no_credentials_configured');
      isFirebaseInitialized = true;
      return false;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseAdmin = admin;
    isFirebaseInitialized = true;

    logger.info('firebase_initialized');
    return true;
  } catch (error) {
    logger.error({ err: error }, 'firebase_init_failed');
    isFirebaseInitialized = true;
    return false;
  }
}

/**
 * Provider de simulation pour le developpement
 * @param {string} _token - Token de notification
 * @param {Object} notification - Notification a envoyer
 * @returns {Promise<boolean>} - Succes de l'envoi
 */
async function simulationProvider(_token, notification) {
  try {
    logger.info(
      { title: notification.title },
      'notification_simulated'
    );

    await new Promise((resolve) => setTimeout(resolve, 100));

    return true;
  } catch (error) {
    logger.error({ err: error }, 'notification_simulation_failed');
    return false;
  }
}

/**
 * Provider OneSignal (placeholder pour implementation future)
 * @param {string} token - Token de notification
 * @param {Object} notification - Notification a envoyer
 * @returns {Promise<boolean>} - Succes de l'envoi
 */
async function oneSignalProvider(token, notification) {
  // TODO: Implementer OneSignal en utilisant NOTIFICATION_CONFIG.oneSignalAppId et NOTIFICATION_CONFIG.oneSignalApiKey
  // Fallback vers simulation en attendant l'implementation
  return simulationProvider(token, notification);
}

/**
 * Provider Firebase Cloud Messaging
 * @param {string|string[]} tokens - Token(s) FCM (peut être un tableau pour multi-device)
 * @param {Object} notification - Notification a envoyer
 * @param {string} notification.title - Titre de la notification
 * @param {string} notification.body - Corps de la notification
 * @param {Object} notification.data - Données custom (url, appId, etc.)
 * @returns {Promise<boolean>} - Succès de l'envoi
 */
async function firebaseProvider(tokens, notification) {
  try {
    if (!initializeFirebase()) {
      logger.warn('firebase_fallback_to_simulation');
      return simulationProvider(tokens, notification);
    }

    const tokenList = Array.isArray(tokens) ? tokens : [tokens];

    if (tokenList.length === 0) {
      logger.warn('firebase_no_tokens_provided');
      return false;
    }

    // allowUnfollow est converti en string 'true'/'false' pour la transmission FCM
    const allowUnfollowValue =
      notification.data?.allowUnfollow === true ? 'true' : 'false';

    const payloadData = {
      allowUnfollow: allowUnfollowValue,
      ...Object.entries(notification.data || {}).reduce((acc, [key, val]) => {
        if (key !== 'allowUnfollow') {
          acc[key] = String(val);
        }
        return acc;
      }, {}),
    };

    // Data-only (Notifee) pour les notifs qui ont une action custom (unfollow OU follow_prompt)
    // Notifee gere l'affichage + le tap de maniere fiable, y compris au cold start
    const needsNotifeeHandling =
      allowUnfollowValue === 'true' || payloadData.type === 'follow_prompt';

    const message = {
      data: {
        ...payloadData,
        title: notification.title || '',
        body: notification.body || '',
      },
      android: {
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-push-type': 'alert',
          'apns-priority': '10',
        },
        payload: {
          aps: {
            sound: 'default',
            'mutable-content': 1,
          },
        },
      },
    };

    // Ajouter la cle notification seulement pour les notifs sans bouton action
    // FCM affiche nativement → tap fiable dans tous les etats Android
    if (!needsNotifeeHandling) {
      message.notification = {
        title: notification.title || '',
        body: notification.body || '',
      };
      message.android.notification = {
        channelId: 'steam_news',
        sound: 'default',
      };
    }

    logger.debug(
      {
        mode: needsNotifeeHandling
          ? 'data-only (Notifee + boutons)'
          : 'notification+data (FCM natif)',
        tokensCount: tokenList.length,
        title: notification.title,
        type: payloadData.type,
        appId: payloadData.appId,
        allowUnfollow: payloadData.allowUnfollow,
      },
      'firebase_send_preparing'
    );

    const response = await firebaseAdmin.messaging().sendEachForMulticast({
      tokens: tokenList,
      ...message,
    });

    logger.info(
      {
        successCount: response.successCount,
        failureCount: response.failureCount,
        tokensTotal: tokenList.length,
      },
      'firebase_send_completed'
    );

    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;

          // Liste des erreurs FCM indiquant un token définitivement invalide
          // À SUPPRIMER de la DB (app désinstallée, token expiré, etc.)
          const PERMANENT_ERROR_CODES = [
            'messaging/invalid-registration-token',
            'messaging/registration-token-not-registered',
            'messaging/invalid-argument',
          ];

          // Erreurs TEMPORAIRES à NE PAS supprimer (quota, réseau, etc.)
          const TEMPORARY_ERROR_CODES = [
            'messaging/server-unavailable',
            'messaging/internal-error',
            'messaging/quota-exceeded',
            'messaging/third-party-auth-error',
          ];

          if (PERMANENT_ERROR_CODES.includes(errorCode)) {
            logger.warn(
              { tokenIndex: idx, errorCode, action: 'mark_for_deletion' },
              'firebase_token_invalid_permanent'
            );
            failedTokens.push(tokenList[idx]);
          } else if (TEMPORARY_ERROR_CODES.includes(errorCode)) {
            logger.warn(
              { tokenIndex: idx, errorCode, action: 'keep_for_retry' },
              'firebase_token_invalid_temporary'
            );
          } else {
            logger.error(
              { tokenIndex: idx, errorCode, action: 'keep_unknown' },
              'firebase_token_unknown_error'
            );
          }
        }
      });

      if (failedTokens.length > 0) {
        return {
          success: response.successCount > 0,
          invalidTokens: failedTokens,
        };
      }
    }

    return response.successCount > 0;
  } catch (error) {
    logger.error({ err: error }, 'firebase_send_failed');
    return false;
  }
}

/**
 * Selectionne le provider actif base sur la configuration
 * @returns {Function} - Provider de notifications
 */
function getActiveProvider() {
  const providerName = (
    NOTIFICATION_CONFIG.provider || 'simulation'
  ).toLowerCase();

  switch (providerName) {
    case 'onesignal':
      return oneSignalProvider;
    case 'firebase':
      return firebaseProvider;
    case 'simulation':
    default:
      return simulationProvider;
  }
}

module.exports = {
  simulationProvider,
  oneSignalProvider,
  firebaseProvider,
  getActiveProvider,
};
