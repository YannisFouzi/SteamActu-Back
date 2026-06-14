const express = require('express');
const router = express.Router();
const User = require('../models/User');
const steamService = require('../services/steamService');
const { syncUserWishlist } = require('../services/syncWishlistService');
const {
  validateUserExists,
  validateActiveGamesFormat,
} = require('../middleware/userValidators');
const {
  validateSteamId,
  validateBodySteamId,
  validateAppId,
  isValidAppId,
} = require('../middleware/steamValidators');
const { mobileSessionAuth } = require('../middleware/mobileSessionAuth');
const requireSelf = require('../middleware/requireSelf');
const logger = require('../utils/logger');
const { sanitizeActiveGames } = require('../services/users/userGameProcessor');
const {
  addUserToGameSubscription,
  removeUserFromGameSubscription,
} = require('../services/users/subscriptionManager');
const {
  buildNotificationSettingsPatch,
  applyNotificationSettingsPatchToUser,
} = require('../services/users/userNotificationSettingsService');
const { getFollowedGamesDetailsBySteamId } = require('../services/users/followedGamesDetailsService');
const {
  getFollowedAppIds,
  buildFollowedGamesEntry,
} = require('../utils/followedGamesHelpers');
const {
  isSupportedAppLanguage,
  normalizeAppLanguage,
  SUPPORTED_LANGUAGES,
} = require('../utils/language');


// Enregistrer un nouvel utilisateur
// Note securite : la creation reelle du compte se fait dans /auth/steam/return
// (callback OpenID verifie par Steam). Cet endpoint est appele APRES, donc le
// mobile a deja sa session. On exige donc auth + ownership pour empecher la
// creation/modification de comptes pour un steamId qu'on ne possede pas.
router.post('/register', mobileSessionAuth, requireSelf, validateBodySteamId, async (req, res) => {
  try {
    const { steamId, language } = req.body;

    // Déléguer la logique métier au service
    const user = await steamService.registerOrUpdateUser(steamId, language);

    res.status(200).json(user);
  } catch (error) {
    logger.error("Erreur lors de l'enregistrement de l'utilisateur:", error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les informations d'un utilisateur
router.get('/:steamId', mobileSessionAuth, requireSelf, validateSteamId, validateUserExists, async (req, res) => {
    try {
      const { steamId } = req.params;
      res.json(req.user);

      const shouldSyncWishlist =
        !req.user?.wishlist || !req.user.wishlist?.lastFullSync;

      if (shouldSyncWishlist) {
        syncUserWishlist(steamId).catch((err) => {
          logger.error('Background wishlist preload failed:', err.message);
        });
      } else {
        logger.info(
          'Wishlist sync skipped (lastFullSync already set)'
        );
      }
    } catch (error) {
      logger.error('Erreur dans GET /users/:steamId:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Mettre à jour les paramètres de notification
router.put(
  '/:steamId/notifications',
  mobileSessionAuth,
  requireSelf,
  validateSteamId,
  validateUserExists,
  async (req, res) => {
    try {
      const user = req.user;
      const parsed = buildNotificationSettingsPatch(req.body);
      if (!parsed.ok) {
        return res.status(400).json({ message: parsed.message });
      }

      applyNotificationSettingsPatchToUser(user, parsed.patch);
      await user.save();

      res.json(user);
    } catch (error) {
      logger.error(
        'Erreur lors de la mise à jour des paramètres de notification:',
        error
      );
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Enregistrer ou mettre à jour un token FCM
router.post('/:steamId/fcm-token', mobileSessionAuth, requireSelf, validateSteamId, validateUserExists, async (req, res) => {
  try {
    const { token, platform } = req.body;
    const user = req.user;

    // Validation stricte des paramètres
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({
        message: 'Token FCM requis et doit être une chaîne non vide',
      });
    }

    // Validation longueur token (les tokens FCM font généralement 100-200+ caractères)
    if (token.length < 50) {
      return res.status(400).json({
        message: 'Token FCM invalide (trop court)',
      });
    }

    // Validation plateforme stricte
    const validPlatforms = ['android', 'ios', 'web'];
    if (!platform || !validPlatforms.includes(platform)) {
      return res.status(400).json({
        message: `Plateforme requise et doit être l'une de: ${validPlatforms.join(', ')}`,
      });
    }

    // Initialiser le tableau si inexistant
    if (!Array.isArray(user.notificationSettings.fcmTokens)) {
      user.notificationSettings.fcmTokens = [];
    }

    // Vérifier si le token existe déjà
    const existingTokenIndex = user.notificationSettings.fcmTokens.findIndex(
      (t) => t.token === token
    );

    if (existingTokenIndex !== -1) {
      // Token existe : mettre à jour la plateforme et la date
      user.notificationSettings.fcmTokens[existingTokenIndex].platform =
        platform;
      user.notificationSettings.fcmTokens[existingTokenIndex].addedAt =
        new Date();
      logger.info(`[FCM] Token mis à jour pour ${user.steamId} (${platform})`);
    } else {
      // Nouveau token : ajouter
      user.notificationSettings.fcmTokens.push({
        token,
        platform,
        addedAt: new Date(),
      });
      logger.info(`[FCM] Nouveau token ajouté pour ${user.steamId} (${platform})`);
    }

    await user.save();

    res.json({
      message: 'Token FCM enregistré avec succès',
      tokensCount: user.notificationSettings.fcmTokens.length,
    });
  } catch (error) {
    logger.error("Erreur lors de l'enregistrement du token FCM:", error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer un token FCM
router.delete('/:steamId/fcm-token', mobileSessionAuth, requireSelf, validateSteamId, validateUserExists, async (req, res) => {
  try {
    const { token } = req.body;
    const user = req.user;

    if (!token) {
      return res.status(400).json({ message: 'Token FCM requis' });
    }

    // Supprimer le token
    const initialLength = user.notificationSettings.fcmTokens?.length || 0;
    user.notificationSettings.fcmTokens = (
      user.notificationSettings.fcmTokens || []
    ).filter((t) => t.token !== token);

    const removed = initialLength - user.notificationSettings.fcmTokens.length;

    if (removed === 0) {
      return res.status(404).json({ message: 'Token non trouvé' });
    }

    await user.save();

    logger.info(`[FCM] Token supprimé pour ${user.steamId}`);
    res.json({
      message: 'Token FCM supprimé avec succès',
      tokensCount: user.notificationSettings.fcmTokens.length,
    });
  } catch (error) {
    logger.error('Erreur lors de la suppression du token FCM:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Mettre à jour la liste des jeux récemment actifs
router.put(
  '/:steamId/active-games',
  mobileSessionAuth,
  requireSelf,
  validateSteamId,
  validateUserExists,
  async (req, res) => {
    try {
      const { games } = req.body || {};
      const user = req.user;

      if (!validateActiveGamesFormat(games)) {
        return res
          .status(400)
          .json({ message: 'Format invalide: games doit être un tableau' });
      }

      const sanitized = sanitizeActiveGames(games);

      user.recentActiveGames = sanitized;
      await user.save();

      res.json({ recentActiveGames: user.recentActiveGames });
    } catch (error) {
      logger.error('Erreur lors de la mise à jour des jeux récents:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Suivre un jeu
router.post('/:steamId/follow', mobileSessionAuth, requireSelf, validateSteamId, validateUserExists, async (req, res) => {
    try {
      const { steamId } = req.params;
      // `notifications: false` = suivi silencieux (bouton +) : news dans le fil,
      // pas de push. Absent ou toute autre valeur = suivi notifié (cloche,
      // comportement historique — rétrocompat avec les vieux clients).
      const { appId, name, logoUrl, notifications } = req.body;

      if (!isValidAppId(String(appId || ''))) {
        return res.status(400).json({ message: 'AppID invalide' });
      }

      // Vérifier si le jeu est déjà suivi
      if (getFollowedAppIds(req.user).includes(appId)) {
        return res.status(400).json({ message: 'Ce jeu est déjà suivi' });
      }

      // Mise à jour atomique : pas de race condition si deux requêtes arrivent en même temps.
      // Le filtre `followedGames.appId` garantit qu'on n'insère pas de doublon même si
      // deux requêtes concurrentes arrivent pour le même jeu.
      // NB : un suivi ne bumpe PAS gamesVersion. gamesVersion = version de la
      // BIBLIOTHÈQUE (jeux possédés) ; suivre/désuivre ne la change pas. Le
      // bumper forçait un rechargement complet des 250 jeux au focus pour une
      // donnée inchangée (lag). La liste des suivis se met à jour via
      // user.followedGames (optimiste + fetch du profil), pas via gamesVersion.
      // followVersion bumpé (pas gamesVersion) : signale au client qu'un SUIVI a
      // changé → re-fetch du profil seul, pas le reload des 250 jeux.
      const updatedUser = await User.findOneAndUpdate(
        { steamId, 'followedGames.appId': { $ne: appId } },
        {
          $push: {
            followedGames: buildFollowedGamesEntry(appId, notifications !== false),
          },
          $set: { followVersion: new Date() },
        },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(400).json({ message: 'Ce jeu est déjà suivi' });
      }

      // Mettre à jour GameSubscription avec imageUrl
      await addUserToGameSubscription(appId, steamId, name, logoUrl);

      res.json(updatedUser);
    } catch (error) {
      logger.error("Erreur lors de l'ajout du jeu aux suivis:", error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Ne plus suivre un jeu
router.delete(
  '/:steamId/follow/:appId',
  mobileSessionAuth,
  requireSelf,
  validateSteamId,
  validateAppId,
  validateUserExists,
  async (req, res) => {
    try {
      const { steamId, appId } = req.params;

      // Vérifier si l'utilisateur suit ce jeu
      if (!getFollowedAppIds(req.user).includes(appId)) {
        return res.status(400).json({ message: "Ce jeu n'est pas suivi" });
      }

      // Pas de bump gamesVersion (cf. POST /follow) ; followVersion bumpé.
      const updatedUser = await User.findOneAndUpdate(
        { steamId, 'followedGames.appId': appId },
        {
          $pull: { followedGames: { appId } },
          $set: { followVersion: new Date() },
        },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(400).json({ message: "Ce jeu n'est pas suivi" });
      }

      // Mettre à jour GameSubscription
      await removeUserFromGameSubscription(appId, steamId);

      res.json(updatedUser);
    } catch (error) {
      logger.error('Erreur lors du retrait du jeu des suivis:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Bascule notifications d'un jeu DÉJÀ suivi (cloche on/off sans désabonner).
// enabled:true = suivi notifié, enabled:false = suivi silencieux (fil sans push).
router.put(
  '/:steamId/follow/:appId/notifications',
  mobileSessionAuth,
  requireSelf,
  validateSteamId,
  validateAppId,
  async (req, res) => {
    try {
      const { steamId, appId } = req.params;
      const { enabled } = req.body || {};

      if (typeof enabled !== 'boolean') {
        return res
          .status(400)
          .json({ message: 'enabled (booléen) est requis' });
      }

      // Update positionnel atomique : ne matche que si le jeu est suivi.
      // Pas de bump gamesVersion (un drapeau de notif ne change pas la
      // bibliothèque) ; followVersion bumpé pour propager le changement.
      const result = await User.updateOne(
        { steamId, 'followedGames.appId': appId },
        {
          $set: {
            'followedGames.$.notifications': enabled,
            followVersion: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ message: "Ce jeu n'est pas suivi" });
      }

      res.json({ ok: true, appId, notifications: enabled });
    } catch (error) {
      logger.error('Erreur lors de la bascule notifications du jeu:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Ajouter une news aux favoris
router.post('/:steamId/news-favorites', mobileSessionAuth, requireSelf, validateSteamId, validateUserExists, async (req, res) => {
  try {
    const { appId, newsId, newsDate } = req.body || {};
    if (!appId || !newsId || !newsDate) {
      return res
        .status(400)
        .json({ message: 'appId, newsId et newsDate sont requis' });
    }

    const user = req.user;
    if (!Array.isArray(user.newsFavorites)) {
      user.newsFavorites = [];
    }

    const exists = user.newsFavorites.some(
      fav => fav.appId === appId && fav.newsId === newsId,
    );

    if (!exists) {
      user.newsFavorites.push({
        appId,
        newsId,
        newsDate: new Date(newsDate),
        createdAt: new Date(),
      });
      await user.save();
    }

    res.json({favorites: user.newsFavorites});
  } catch (error) {
    logger.error('Erreur lors de l’ajout du favori:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer une news des favoris
router.delete(
  '/:steamId/news-favorites/:appId/:newsId',
  mobileSessionAuth,
  requireSelf,
  validateSteamId,
  validateAppId,
  validateUserExists,
  async (req, res) => {
    try {
      const { appId, newsId } = req.params;
      const user = req.user;

      if (!Array.isArray(user.newsFavorites) || user.newsFavorites.length === 0) {
        return res.json({favorites: []});
      }

      user.newsFavorites = user.newsFavorites.filter(
        fav => !(fav.appId === appId && fav.newsId === newsId),
      );
      await user.save();

      res.json({favorites: user.newsFavorites});
    } catch (error) {
      logger.error('Erreur lors de la suppression du favori:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  },
);

router.get('/:steamId/followed-games-details', mobileSessionAuth, requireSelf, validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;
    const result = await getFollowedGamesDetailsBySteamId(steamId);

    if (result.type === 'not_found') {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    res.json({ followedGames: result.followedGames });
  } catch (error) {
    logger.error('Erreur dans /followed-games-details:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer le compte utilisateur
router.delete('/:steamId', mobileSessionAuth, requireSelf, validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    // Récupérer l'utilisateur
    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Statistiques de nettoyage
    const followedAppIds = getFollowedAppIds(user);
    const stats = {
      followedGames: followedAppIds.length,
      gameSubscriptionsRemoved: 0,
    };

    // Unfollow tous les jeux (nettoyage automatique des GameSubscriptions)
    if (followedAppIds.length > 0) {
      logger.info(
        `[INFO] Nettoyage de ${followedAppIds.length} jeux suivis...`
      );

      for (const appId of followedAppIds) {
        const wasDeleted = await removeUserFromGameSubscription(appId, steamId);
        if (wasDeleted) {
          stats.gameSubscriptionsRemoved++;
        }
      }

      logger.info(
        `[OK] ${stats.gameSubscriptionsRemoved} GameSubscription(s) supprimée(s)`
      );
    }

    // Supprimer le compte utilisateur
    await User.deleteOne({ steamId });
    logger.info('[OK] Compte utilisateur supprimé');

    res.json({
      message: 'Compte supprimé avec succès',
      stats: stats,
    });
  } catch (error) {
    logger.error('Erreur lors de la suppression du compte:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Marquer le fil d'actu comme vu (curseur high-water-mark, multi-device)
// Update atomique conditionnel: ne recule jamais, pas de full-doc load,
// safe vs writes concurrentes multi-device.
router.put(
  '/:steamId/news/seen',
  mobileSessionAuth,
  requireSelf,
  validateSteamId,
  async (req, res) => {
    try {
      const { steamId } = req.params;
      const { seenAt } = req.body || {};
      const ts = seenAt ? new Date(seenAt) : new Date();

      if (Number.isNaN(ts.getTime())) {
        return res.status(400).json({ message: 'seenAt invalide' });
      }

      const result = await User.findOneAndUpdate(
        {
          steamId,
          $or: [
            { lastNewsFeedSeenAt: null },
            { lastNewsFeedSeenAt: { $lt: ts } },
          ],
        },
        { $set: { lastNewsFeedSeenAt: ts } },
        { new: true, projection: { lastNewsFeedSeenAt: 1, _id: 0 } }
      );

      if (result) {
        return res.json({ lastNewsFeedSeenAt: result.lastNewsFeedSeenAt });
      }

      const existing = await User.findOne(
        { steamId },
        { lastNewsFeedSeenAt: 1, _id: 0 }
      ).lean();

      if (!existing) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      res.json({ lastNewsFeedSeenAt: existing.lastNewsFeedSeenAt });
    } catch (error) {
      logger.error('Erreur lors du marquage du fil comme vu:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

router.put('/:steamId/language', mobileSessionAuth, requireSelf, validateSteamId, validateUserExists, async (req, res) => {
  try {
    const { language } = req.body || {};

    if (
      !isSupportedAppLanguage(language)
    ) {
      return res.status(400).json({
        message: `language doit etre l'une des valeurs suivantes: ${SUPPORTED_LANGUAGES.join(', ')}`,
      });
    }

    const normalizedLanguage = normalizeAppLanguage(language);
    req.user.language = normalizedLanguage;
    await req.user.save();

    res.json({
      steamId: req.user.steamId,
      language: req.user.language,
    });
  } catch (error) {
    logger.error('Erreur lors de la mise a jour de la langue:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
