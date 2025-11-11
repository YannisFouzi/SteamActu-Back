/**
 * Routes Steam API
 *
 * ⚠️ MODIFICATION ISSUE DE L'AUDIT 2025-11-04
 * - gameLibrary.games[] → gameLibrary.gameIds[]
 * - Jeux récupérés depuis la collection Games
 * Voir: AUDIT_REPORT.md et ACTIONS.md
 */

const express = require('express');
const router = express.Router();
const steamService = require('../services/steamService');
const User = require('../models/User');
const Game = require('../models/Game');
const Wishlist = require('../models/Wishlist');
const { validateSteamId } = require('../middleware/steamValidators');
const {
  formatGame,
  getLastUpdateTimestamp,
} = require('../services/steam/gameFormatter');

/**
 * Endpoint léger pour vérifier les versions de données
 * Permet au frontend de savoir si les données ont changé sans télécharger tout
 */
router.get('/status/:steamId', validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId })
      .select('gamesVersion wishlistVersion')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // Renvoyer les versions en ISO string (ou null si pas encore défini)
    res.json({
      gamesVersion: user.gamesVersion ? user.gamesVersion.toISOString() : null,
      wishlistVersion: user.wishlistVersion
        ? user.wishlistVersion.toISOString()
        : null,
    });
  } catch (error) {
    console.error('Erreur dans /status/:steamId:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.get('/games/:steamId', validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId })
      .select('gameLibrary followedGames recentActiveGames')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const userGames = user.gameLibrary?.games || [];

    if (userGames.length === 0) {
      return res.json([]);
    }

    const gameIds = userGames.map((g) => g.gameId);
    const gamesData = await Game.find({ appId: { $in: gameIds } })
      .select('appId name img_icon_url')
      .lean();

    const gamesMap = new Map(gamesData.map((g) => [g.appId, g]));

    const games = userGames.map((userGame) => {
      const gameData = gamesMap.get(userGame.gameId);
      return {
        appid: userGame.gameId,
        name: gameData?.name || `Game ${userGame.gameId}`,
        img_icon_url: gameData?.img_icon_url || '',
        playtime_forever: userGame.playtime_forever || 0,
        rtime_last_played: userGame.rtime_last_played || 0,
        playtime_2weeks: userGame.playtime_2weeks || 0,
      };
    });

    const formattedGames = games.map((game) => {
      const lastUpdateTimestamp = getLastUpdateTimestamp(game.appid, user);
      return formatGame(game, lastUpdateTimestamp);
    });

    res.json(formattedGames);
  } catch (error) {
    console.error('Erreur dans /games/:steamId:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer le profil d'un utilisateur Steam
router.get('/profile/:steamId', validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    // Récupérer le profil
    const profile = await steamService.getUserProfile(steamId);

    if (!profile) {
      return res.status(404).json({ message: 'Profil Steam non trouvé' });
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Récupérer la wishlist d'un utilisateur Steam (depuis BDD uniquement)
router.get('/wishlist/:steamId', validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    const user = await User.findOne({ steamId })
      .select('wishlist followedGames')
      .lean();

    if (!user?.wishlist?.games || user.wishlist.games.length === 0) {
      console.log('ℹ️ Wishlist vide');
      return res.json([]);
    }

    const gameIds = user.wishlist.games.map((g) => g.gameId);
    const wishlistGames = await Wishlist.find({
      appId: { $in: gameIds },
    }).lean();

    const followedSet = new Set(user.followedGames || []);

    const result = user.wishlist.games
      .map((userGame) => {
        const gameData = wishlistGames.find((g) => g.appId === userGame.gameId);
        if (!gameData) return null;

        return {
          appid: parseInt(userGame.gameId, 10),
          name: gameData.name || `Game ${userGame.gameId}`,
          capsule: gameData.img_icon_url || '',
          header_image: gameData.img_icon_url || '',
          date_added: userGame.date_added,
          priority: userGame.priority,
          isFollowed: followedSet.has(userGame.gameId),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.date_added - a.date_added);

    console.log(`✅ ${result.length} jeux retournés depuis BDD`);
    res.json(result);
  } catch (error) {
    console.error('Erreur dans /wishlist/:steamId:', error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q, limit } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        message: 'La recherche doit contenir au moins 2 caractères',
      });
    }

    const results = await steamService.searchGames(
      q.trim(),
      parseInt(limit) || 5
    );

    res.json(results);
  } catch (error) {
    console.error('Erreur dans /search:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
