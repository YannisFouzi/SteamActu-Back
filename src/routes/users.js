const express = require("express");
const router = express.Router();
const User = require("../models/User");
const steamService = require("../services/steamService");

// Enregistrer un nouvel utilisateur
router.post("/register", async (req, res) => {
  try {
    const { steamId } = req.body;

    // Vérifier si l'utilisateur existe déjà
    let user = await User.findOne({ steamId });

    if (user) {
      return res.status(400).json({ message: "Cet utilisateur existe déjà" });
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
router.get("/:steamId", async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json(user);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'utilisateur:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Mettre à jour les jeux suivis par l'utilisateur
router.put("/:steamId/games", async (req, res) => {
  try {
    const { steamId } = req.params;
    const { games } = req.body;

    if (!Array.isArray(games)) {
      return res
        .status(400)
        .json({ message: 'Format invalide, "games" doit être un tableau' });
    }

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    // Mettre à jour la liste des jeux suivis
    user.followedGames = games;
    user.lastChecked = new Date();

    await user.save();

    res.json(user);
  } catch (error) {
    console.error("Erreur lors de la mise à jour des jeux:", error);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// Mettre à jour les paramètres de notification
router.put("/:steamId/notifications", async (req, res) => {
  try {
    const { steamId } = req.params;
    const { enabled, pushToken, autoFollowNewGames } = req.body;

    const user = await User.findOne({ steamId });

    if (!user) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

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

module.exports = router;
