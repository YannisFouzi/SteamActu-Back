const express = require("express");
const router = express.Router();
const User = require("../models/User");
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
      return res.status(200).json(user);
    }

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
    });

    await user.save();

    res.status(201).json(user);
  } catch (error) {
    console.error("Erreur lors de l'enregistrement de l'utilisateur:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Récupérer les informations d'un utilisateur
router.get("/:steamId", validateUserExists, async (req, res) => {
  try {
    console.log("Récupération utilisateur:", req.params.steamId);
    res.json(req.user);
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
    const { appId, name } = req.body;
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

    // 2. Mettre à jour GameSubscription
    await addUserToGameSubscription(appId, steamId, name);

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

module.exports = router;
