const express = require("express");
const router = express.Router();
const User = require("../models/User");
const GameSubscription = require("../models/GameSubscription");
const steamService = require("../services/steamService");
const {
  validateUserExists,
  validateActiveGamesFormat,
} = require("../middleware/userValidators");
const {
  migrateFollowedGames,
  sanitizeActiveGames,
} = require("../services/users/gameProcessor");
const {
  addUserToGameSubscription,
  removeUserFromGameSubscription,
} = require("../services/users/subscriptionManager");

// Enregistrer un nouvel utilisateur
router.post("/register", async (req, res) => {
  try {
    const { steamId } = req.body;

    // Vérifier si l'utilisateur existe déjà
    let user = await User.findOne({ steamId });

    if (user) {
      console.log(`✅ User existant: ${user.username} (${steamId})`);
      return res.status(200).json(user);
    }

    console.log(`\n${"=".repeat(70)}`);
    console.log(`🆕 NOUVEL UTILISATEUR - Création + Sync immédiate`);
    console.log(`${"=".repeat(70)}`);

    // Récupérer les infos du profil Steam
    const profileData = await steamService.getUserProfile(steamId);

    if (!profileData) {
      return res.status(404).json({ message: "Profil Steam non trouvé" });
    }

    // Créer un nouvel utilisateur
    user = new User({
      steamId,
      username: profileData.personaname,
      avatarUrl: profileData.avatarfull,
      lastChecked: null, // Important : null pour permettre sync immédiate
    });

    await user.save();
    console.log(`✅ User créé: ${user.username} (${steamId})`);

    // ⚡ SYNC IMMÉDIATE des jeux pour nouvel utilisateur
    // On ne peut pas attendre dimanche 3h, l'utilisateur veut voir ses jeux maintenant !
    console.log(`⚡ Lancement sync immédiate des jeux...`);

    try {
      const { syncUserGames } = require("../services/gameSync/userProcessor");
      const syncResult = await syncUserGames(user);

      if (syncResult.error) {
        console.error(`⚠️ Erreur sync jeux (non bloquant):`, syncResult.error);
      } else {
        console.log(`✅ Sync réussie: ${syncResult.updatedGames?.length || 0} jeux ajoutés`);
      }
    } catch (syncError) {
      console.error(`⚠️ Erreur sync jeux (non bloquant):`, syncError.message);
      // On ne bloque pas l'inscription si la sync échoue
    }

    // Recharger le user pour avoir les données à jour (après sync)
    user = await User.findOne({ steamId });

    console.log(`${"=".repeat(70)}\n`);

    res.status(201).json(user);
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de l'utilisateur:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Récupérer les informations d'un utilisateur
router.get("/:steamId", validateUserExists, async (req, res) => {
  try {
    const { steamId } = req.params;
    console.log("Récupération utilisateur:", steamId);

    res.json(req.user);

    const shouldSyncWishlist =
      !req.user?.wishlist || !req.user.wishlist?.lastFullSync;

    if (shouldSyncWishlist) {
      const { syncUserWishlist } = require("../services/syncWishlistService");
      syncUserWishlist(steamId).catch((err) => {
        console.error(`Background wishlist preload failed for ${steamId}:`, err.message);
      });
    } else {
      console.log(`Wishlist sync skipped for ${steamId} (lastFullSync already set)`);
    }
  } catch (error) {
    console.error("Erreur dans GET /users/:steamId:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Mettre à jour les paramètres de notification
router.put("/:steamId/notifications", validateUserExists, async (req, res) => {
  try {
    const { enabled, pushToken, autoFollowNewGames } = req.body;
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

    await user.save();

    res.json(user);
  } catch (error) {
    console.error(
      "Erreur lors de la mise à jour des paramètres de notification:",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Mettre à jour la liste des jeux récemment actifs
router.put("/:steamId/active-games", validateUserExists, async (req, res) => {
  try {
    const { games } = req.body || {};
    const user = req.user;

    if (!validateActiveGamesFormat(games)) {
      return res
        .status(400)
        .json({ message: "Format invalide: games doit être un tableau" });
    }

    const sanitized = sanitizeActiveGames(games);

    user.recentActiveGames = sanitized;
    await user.save();

    res.json({ recentActiveGames: user.recentActiveGames });
  } catch (error) {
    console.error("Erreur lors de la mise à jour des jeux récents:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Suivre un jeu
router.post("/:steamId/follow", validateUserExists, async (req, res) => {
  try {
    const { steamId } = req.params;
    const { appId, name, logoUrl } = req.body;
    const user = req.user;

    // Migrer l'ancienne structure si nécessaire
    migrateFollowedGames(user);

    // Vérifier si le jeu est déjà suivi
    const isAlreadyFollowed = user.followedGames.includes(appId);
    if (isAlreadyFollowed) {
      return res.status(400).json({ message: "Ce jeu est déjà suivi" });
    }

    // 1. Ajouter à user.followedGames
    user.followedGames.push(appId);
    await user.save();

    // 2. Mettre à jour GameSubscription avec imageUrl
    await addUserToGameSubscription(appId, steamId, name, logoUrl);

    res.json(user);
  } catch (error) {
    console.error("Erreur lors de l'ajout du jeu aux suivis:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Ne plus suivre un jeu
router.delete(
  "/:steamId/follow/:appId",
  validateUserExists,
  async (req, res) => {
    try {
      const { steamId, appId } = req.params;
      const user = req.user;

      // Migrer l'ancienne structure si nécessaire
      migrateFollowedGames(user);

      // Vérifier si l'utilisateur suit ce jeu
      if (!user.followedGames.includes(appId)) {
        return res.status(400).json({ message: "Ce jeu n'est pas suivi" });
      }

      // 1. Retirer de user.followedGames
      user.followedGames = user.followedGames.filter(
        (gameId) => gameId !== appId
      );
      await user.save();

      // 2. Mettre à jour GameSubscription
      await removeUserFromGameSubscription(appId, steamId);

      res.json(user);
    } catch (error) {
      console.error("Erreur lors du retrait du jeu des suivis:", error);
      res.status(500).json({ message: "Erreur serveur" });
    }
  }
);

router.get("/:steamId/followed-games-details", async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    if (!user.followedGames || user.followedGames.length === 0) {
      return res.json({ followedGames: [] });
    }

    const subscriptions = await GameSubscription.find({
      gameId: { $in: user.followedGames },
    })
      .select("gameId name imageUrl")
      .lean();

    const followedGamesDetails = subscriptions.map((sub) => ({
      appId: sub.gameId,
      name: sub.name,
      imageUrl: sub.imageUrl || "",
    }));

    res.json({ followedGames: followedGamesDetails });
  } catch (error) {
    console.error("Erreur dans /followed-games-details:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
