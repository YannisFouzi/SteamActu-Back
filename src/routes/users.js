const express = require("express");
const router = express.Router();
const User = require("../models/User");
const GameSubscription = require("../models/GameSubscription");
const steamService = require("../services/steamService");

// Enregistrer un nouvel utilisateur
router.post("/register", async (req, res) => {
  try {
    const { steamId } = req.body;

    // VÃ©rifier si l'utilisateur existe dÃ©jÃ 
    let user = await User.findOne({ steamId });

    if (user) {
      return res.status(400).json({ message: "Cet utilisateur existe deja" });
    }

    // RÃ©cupÃ©rer les infos du profil Steam
    const profileData = await steamService.getUserProfile(steamId);

    if (!profileData) {
      return res.status(404).json({ message: "Profil Steam non trouvÃ©" });
    }

    // CrÃ©er un nouvel utilisateur
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

// RÃ©cupÃ©rer les informations d'un utilisateur
router.get("/:steamId", async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvÃ©" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Mettre Ã  jour les paramÃ¨tres de notification
router.put("/:steamId/notifications", async (req, res) => {
  try {
    const { steamId } = req.params;
    const { enabled, pushToken, autoFollowNewGames } = req.body;

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvÃ©" });
    }

    // Mettre Ã  jour les paramÃ¨tres de notification
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
      "Erreur lors de la mise Ã  jour des paramÃ¨tres de notification:",
      error
    );
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Suivre un jeu
router.post("/:steamId/follow", async (req, res) => {
  try {
    const { steamId } = req.params;
    const { appId, name, logoUrl } = req.body;

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvÃ©" });
    }

    // Initialiser followedGames si undefined ou migrer l'ancienne structure
    if (!user.followedGames) {
      user.followedGames = [];
    } else if (
      user.followedGames.length > 0 &&
      typeof user.followedGames[0] === "object"
    ) {
      // Migration Ã  la volÃ©e : convertir l'ancienne structure en nouvelle
      console.log(`ðŸ”„ Migration Ã  la volÃ©e pour l'utilisateur ${steamId}`);
      user.followedGames = user.followedGames.map((game) => game.appId);
    }

    // VÃ©rifier si le jeu est dÃ©jÃ  suivi (nouvelle structure : array d'IDs)
    const isAlreadyFollowed = user.followedGames.includes(appId);
    if (isAlreadyFollowed) {
      return res.status(400).json({ message: "Ce jeu est dÃ©jÃ  suivi" });
    }

    // DOUBLE Ã‰CRITURE : Mettre Ã  jour les deux structures

    // 1. Ajouter Ã  user.followedGames (nouvelle structure simplifiÃ©e)
    user.followedGames.push(appId);
    await user.save();

    // 2. Mettre Ã  jour GameSubscription
    let gameSubscription = await GameSubscription.findOne({ gameId: appId });

    if (!gameSubscription) {
      // CrÃ©er nouvelle subscription pour ce jeu
      const firstFollowTimestamp = Math.floor(Date.now() / 1000);
      gameSubscription = new GameSubscription({
        gameId: appId,
        name: name || `Jeu ${appId}`,
        subscribers: [steamId],
        lastNewsTimestamp: firstFollowTimestamp,
      });
    } else {
      // Ajouter l'utilisateur aux subscribers s'il n'y est pas dÃ©jÃ 
      if (!gameSubscription.subscribers.includes(steamId)) {
        gameSubscription.subscribers.push(steamId);
      }
    }

    await gameSubscription.save();

    console.log(
      `âœ… Utilisateur ${steamId} suit maintenant le jeu ${appId} (${name})`
    );
    res.json(user);
  } catch (error) {
    console.error("Erreur lors de l'ajout du jeu aux suivis:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Ne plus suivre un jeu
router.delete("/:steamId/follow/:appId", async (req, res) => {
  try {
    const { steamId, appId } = req.params;

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvÃ©" });
    }

    // Initialiser followedGames si undefined ou migrer l'ancienne structure
    if (!user.followedGames) {
      user.followedGames = [];
    } else if (
      user.followedGames.length > 0 &&
      typeof user.followedGames[0] === "object"
    ) {
      // Migration Ã  la volÃ©e : convertir l'ancienne structure en nouvelle
      console.log(`ðŸ”„ Migration Ã  la volÃ©e pour l'utilisateur ${steamId}`);
      user.followedGames = user.followedGames.map((game) => game.appId);
    }

    // VÃ©rifier si l'utilisateur suit ce jeu
    if (!user.followedGames.includes(appId)) {
      return res.status(400).json({ message: "Ce jeu n'est pas suivi" });
    }

    // DOUBLE SUPPRESSION : Mettre Ã  jour les deux structures

    // 1. Retirer de user.followedGames (nouvelle structure : array d'IDs)
    user.followedGames = user.followedGames.filter(
      (gameId) => gameId !== appId
    );
    await user.save();

    // 2. Mettre Ã  jour GameSubscription
    const gameSubscription = await GameSubscription.findOne({ gameId: appId });

    if (gameSubscription) {
      // Retirer l'utilisateur des subscribers
      gameSubscription.subscribers = gameSubscription.subscribers.filter(
        (subscriber) => subscriber !== steamId
      );

      // Si plus aucun subscriber, supprimer le document
      if (gameSubscription.subscribers.length === 0) {
        await GameSubscription.deleteOne({ gameId: appId });
        console.log(
          `ðŸ—‘ï¸  GameSubscription supprimÃ©e pour le jeu ${appId} (plus d'abonnÃ©s)`
        );
      } else {
        await gameSubscription.save();
        console.log(`âœ… Utilisateur ${steamId} ne suit plus le jeu ${appId}`);
      }
    }

    res.json(user);
  } catch (error) {
    console.error("Erreur lors du retrait du jeu des suivis:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

module.exports = router;
