const express = require('express');
const router = express.Router();
const User = require('../models/User');
const GameSubscription = require('../models/GameSubscription');
const steamService = require('../services/steamService');
require('../services/gamesSync/userProcessor');
const { syncUserWishlist } = require('../services/syncWishlistService');
const {
  validateUserExists,
  validateActiveGamesFormat,
} = require('../middleware/userValidators');
const { sanitizeActiveGames } = require('../services/users/userGameProcessor');
const {
  addUserToGameSubscription,
  removeUserFromGameSubscription,
} = require('../services/users/subscriptionManager');

// Enregistrer un nouvel utilisateur
router.post('/register', async (req, res) => {
  try {
    const { steamId } = req.body;

    // Déléguer la logique métier au service
    const user = await steamService.registerOrUpdateUser(steamId);

    res.status(200).json(user);
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de l'utilisateur:", error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer les informations d'un utilisateur
router.get('/:steamId', validateUserExists, async (req, res) => {
    try {
      const { steamId } = req.params;
      console.log('Récupération utilisateur:', steamId);

      res.json(req.user);

      const shouldSyncWishlist =
        !req.user?.wishlist || !req.user.wishlist?.lastFullSync;

      if (shouldSyncWishlist) {
        syncUserWishlist(steamId).catch((err) => {
          console.error(
            `Background wishlist preload failed for ${steamId}:`,
            err.message
          );
        });
      } else {
        console.log(
          `Wishlist sync skipped for ${steamId} (lastFullSync already set)`
        );
      }
    } catch (error) {
      console.error('Erreur dans GET /users/:steamId:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Mettre à jour les paramètres de notification
router.put(
  '/:steamId/notifications',
  validateUserExists,
  async (req, res) => {
    try {
      const {
        enabled,
        pushToken,
        autoFollowNewGames,
        autoFollowWishlistGames,
      } = req.body;
      const user = req.user;

      // Mettre à jour les paramètres de notification
      if (enabled !== undefined) {
        user.notificationSettings.enabled = enabled;
      }

      if (pushToken) {
        user.notificationSettings.pushToken = pushToken;
      }

      if (autoFollowNewGames !== undefined) {
        user.notificationSettings.autoFollowNewGames = autoFollowNewGames;
      }

      if (autoFollowWishlistGames !== undefined) {
        user.notificationSettings.autoFollowWishlistGames =
          autoFollowWishlistGames;
      }

      await user.save();

      res.json(user);
    } catch (error) {
      console.error(
        'Erreur lors de la mise à jour des paramètres de notification:',
        error
      );
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Mettre à jour la liste des jeux récemment actifs
router.put(
  '/:steamId/active-games',
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
      console.error('Erreur lors de la mise à jour des jeux récents:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Suivre un jeu
router.post('/:steamId/follow', validateUserExists, async (req, res) => {
    try {
      const { steamId } = req.params;
      const { appId, name, logoUrl } = req.body;
      const user = req.user;

      if (!Array.isArray(user.followedGames)) {
        user.followedGames = [];
      }

      // Vérifier si le jeu est déjà suivi
      const isAlreadyFollowed = user.followedGames.includes(appId);
      if (isAlreadyFollowed) {
        return res.status(400).json({ message: 'Ce jeu est déjà suivi' });
      }

      // 1. Ajouter à user.followedGames
      user.followedGames.push(appId);

      // ✨ Bump version pour invalidation cache frontend
      user.gamesVersion = new Date();

      await user.save();

      // 2. Mettre à jour GameSubscription avec imageUrl
      await addUserToGameSubscription(appId, steamId, name, logoUrl);

      res.json(user);
    } catch (error) {
      console.error("Erreur lors de l'ajout du jeu aux suivis:", error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

// Ne plus suivre un jeu
router.delete(
  '/:steamId/follow/:appId',
  validateUserExists,
  async (req, res) => {
    try {
      const { steamId, appId } = req.params;
      const user = req.user;

      if (!Array.isArray(user.followedGames)) {
        user.followedGames = [];
      }

      // Vérifier si l'utilisateur suit ce jeu
      if (!user.followedGames.includes(appId)) {
        return res.status(400).json({ message: "Ce jeu n'est pas suivi" });
      }

      // 1. Retirer de user.followedGames
      user.followedGames = user.followedGames.filter(
        (gameId) => gameId !== appId
      );

      // ✨ Bump version pour invalidation cache frontend
      user.gamesVersion = new Date();

      await user.save();

      // 2. Mettre à jour GameSubscription
      await removeUserFromGameSubscription(appId, steamId);

      res.json(user);
    } catch (error) {
      console.error('Erreur lors du retrait du jeu des suivis:', error);
      res.status(500).json({ message: 'Erreur serveur' });
    }
  }
);

router.get('/:steamId/followed-games-details', async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (!user.followedGames || user.followedGames.length === 0) {
      return res.json({ followedGames: [] });
    }

    const subscriptions = await GameSubscription.find({
      gameId: { $in: user.followedGames },
    })
      .select('gameId name imageUrl')
      .lean();

    const followedGamesDetails = subscriptions.map((sub) => ({
      appId: sub.gameId,
      name: sub.name,
      imageUrl: sub.imageUrl || '',
    }));

    res.json({ followedGames: followedGamesDetails });
  } catch (error) {
    console.error('Erreur dans /followed-games-details:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Supprimer le compte utilisateur
router.delete('/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;

    console.log(`🗑️  Demande de suppression du compte: ${steamId}`);

    // Récupérer l'utilisateur
    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Statistiques de nettoyage
    const stats = {
      followedGames: user.followedGames?.length || 0,
      gameSubscriptionsRemoved: 0,
    };

    // Unfollow tous les jeux (nettoyage automatique des GameSubscriptions)
    if (user.followedGames && user.followedGames.length > 0) {
      console.log(
        `📋 Nettoyage de ${user.followedGames.length} jeux suivis...`
      );

      for (const appId of user.followedGames) {
        const wasDeleted = await removeUserFromGameSubscription(appId, steamId);
        if (wasDeleted) {
          stats.gameSubscriptionsRemoved++;
        }
      }

      console.log(
        `✅ ${stats.gameSubscriptionsRemoved} GameSubscription(s) supprimée(s)`
      );
    }

    // Supprimer le compte utilisateur
    await User.deleteOne({ steamId });
    console.log(`✅ Compte utilisateur ${user.username} (${steamId}) supprimé`);

    res.json({
      message: 'Compte supprimé avec succès',
      stats: stats,
    });
  } catch (error) {
    console.error('Erreur lors de la suppression du compte:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
