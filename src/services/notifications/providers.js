/**
 * Providers de notifications push
 * Architecture prete pour les implementations futures
 */

const { NOTIFICATION_CONFIG } = require('../../config/app');
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

    // Vérifier les credentials
    if (!NOTIFICATION_CONFIG.firebaseServiceAccountPath) {
      console.warn(
        '[Firebase] FIREBASE_SERVICE_ACCOUNT_PATH non configuré. Provider désactivé.'
      );
      isFirebaseInitialized = true;
      return false;
    }

    // Résoudre le chemin absolu depuis la racine du projet
    const serviceAccountPath = path.resolve(
      process.cwd(),
      NOTIFICATION_CONFIG.firebaseServiceAccountPath
    );

    // Vérifier que le fichier existe
    if (!fs.existsSync(serviceAccountPath)) {
      console.error(
        `[Firebase] ❌ Fichier service account introuvable: ${serviceAccountPath}`
      );
      console.error(
        `[Firebase] Vérifiez que FIREBASE_SERVICE_ACCOUNT_PATH pointe vers le bon fichier`
      );
      isFirebaseInitialized = true;
      return false;
    }

    // Charger le service account avec chemin absolu
    const serviceAccount = require(serviceAccountPath);

    // Initialiser Firebase Admin
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    firebaseAdmin = admin;
    isFirebaseInitialized = true;

    console.log('[Firebase] ✅ Firebase Admin SDK initialisé avec succès');
    return true;
  } catch (error) {
    console.error('[Firebase] ❌ Erreur initialisation:', error.message);
    isFirebaseInitialized = true;
    return false;
  }
}

/**
 * Provider de simulation pour le developpement
 * @param {string} token - Token de notification
 * @param {Object} notification - Notification a envoyer
 * @returns {Promise<boolean>} - Succes de l'envoi
 */
async function simulationProvider(token, notification) {
  try {
    console.log('[Notification] Simulation envoyée:', notification.title);

    // Simulation d'un delai reseau
    await new Promise((resolve) => setTimeout(resolve, 100));

    return true;
  } catch (error) {
    console.error('Erreur simulation notification:', error);
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
  /*
  const response = await axios.post('https://onesignal.com/api/v1/notifications', {
    app_id: NOTIFICATION_CONFIG.oneSignalAppId,
    include_player_ids: [token],
    headings: { fr: notification.title, en: notification.title },
    contents: { fr: notification.body, en: notification.body },
    data: notification.data
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${NOTIFICATION_CONFIG.oneSignalApiKey}`
    }
  });

  return response.status === 200;
  */

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
    // Initialiser Firebase si nécessaire
    if (!initializeFirebase()) {
      console.warn('[Firebase] Non initialisé, fallback vers simulation');
      return simulationProvider(tokens, notification);
    }

    // Normaliser tokens en tableau
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];

    if (tokenList.length === 0) {
      console.warn('[Firebase] Aucun token fourni');
      return false;
    }

    const payloadData = {
      title: notification.title || '',
      body: notification.body || '',
      allowUnfollow: '1',
      ...Object.entries(notification.data || {}).reduce((acc, [key, val]) => {
        acc[key] = String(val);
        return acc;
      }, {}),
    };

    // Construire le message FCM (data-only pour permettre les actions custom côté client)
    const message = {
      data: payloadData,
      android: {
        priority: 'high',
      },
      apns: {
        headers: {
          'apns-push-type': 'background',
          'apns-priority': '5',
        },
        payload: {
          aps: {
            'content-available': 1,
          },
        },
      },
    };

    // LOGS DÉTAILLÉS
    console.log('[Firebase] 📤 Préparation envoi notification:');
    console.log('  Tokens:', tokenList.length, 'devices');
    console.log('  Title:', payloadData.title);
    console.log('  Body:', payloadData.body);
    console.log('  Data:', JSON.stringify(payloadData));
    console.log('  Message complet:', JSON.stringify(message, null, 2));

    // Envoyer à tous les tokens (multicast)
    const response = await firebaseAdmin.messaging().sendEachForMulticast({
      tokens: tokenList,
      ...message,
    });

    console.log(
      `[Firebase] ✅ ${response.successCount}/${tokenList.length} notifications envoyées`
    );

    // Logger les tokens invalides pour nettoyage
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          console.warn(
            `[Firebase] ⚠️ Échec envoi token [${idx}]: ${errorCode}`
          );

          // Liste des erreurs FCM indiquant un token définitivement invalide
          // À SUPPRIMER de la DB (app désinstallée, token expiré, etc.)
          const PERMANENT_ERROR_CODES = [
            'messaging/invalid-registration-token',
            'messaging/registration-token-not-registered',
            'messaging/invalid-argument', // Token malformé
          ];

          // Erreurs TEMPORAIRES à NE PAS supprimer (quota, réseau, etc.)
          const TEMPORARY_ERROR_CODES = [
            'messaging/server-unavailable',
            'messaging/internal-error',
            'messaging/quota-exceeded',
            'messaging/third-party-auth-error',
          ];

          if (PERMANENT_ERROR_CODES.includes(errorCode)) {
            console.warn(
              `[Firebase] → Token marqué pour suppression (erreur permanente)`
            );
            failedTokens.push(tokenList[idx]);
          } else if (TEMPORARY_ERROR_CODES.includes(errorCode)) {
            console.warn(
              `[Firebase] → Token conservé (erreur temporaire, réessayer plus tard)`
            );
          } else {
            // Erreur inconnue : logger mais ne pas supprimer par précaution
            console.error(
              `[Firebase] → Code d'erreur inconnu: ${errorCode} (token conservé)`
            );
          }
        }
      });

      // Retourner les tokens invalides pour cleanup
      if (failedTokens.length > 0) {
        return { success: response.successCount > 0, invalidTokens: failedTokens };
      }
    }

    return response.successCount > 0;
  } catch (error) {
    console.error('[Firebase] ❌ Erreur envoi:', error.message);
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
