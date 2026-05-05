/**
 * Routes Steam API
 */

const express = require('express');
const router = express.Router();
const steamService = require('../services/steamService');
const User = require('../models/User');
const Game = require('../models/Game');
const Wishlist = require('../models/Wishlist');
const { validateSteamId, clampQueryInt } = require('../middleware/steamValidators');
const { apiLimiter } = require('../middleware/rateLimiter');
const {
  fetchGameDetails,
  fetchUserGames,
  fetchUserWishlist,
} = require('../services/steam/apiClient');
const { syncUserGames } = require('../services/gamesSync/userProcessor');
const { syncUserWishlist } = require('../services/syncWishlistService');
const {
  formatGame,
  getLastUpdateTimestamp,
} = require('../services/steam/gameFormatter');
const { SIMULATION_CONFIG } = require('../config/app');
const { getFollowedAppIds } = require('../utils/followedGamesHelpers');

function hasSteamPlaytimeFields(game) {
  if (!game || typeof game !== 'object') {
    return false;
  }

  return (
    Object.prototype.hasOwnProperty.call(game, 'playtime_forever') ||
    Object.prototype.hasOwnProperty.call(game, 'playtime_2weeks') ||
    Object.prototype.hasOwnProperty.call(game, 'rtime_last_played')
  );
}

async function getWishlistVisibilityState(steamId) {
  try {
    const items = await fetchUserWishlist(steamId);
    return {
      visible: Array.isArray(items) && items.length > 0,
      count: Array.isArray(items) ? items.length : 0,
      items: Array.isArray(items) ? items : [],
    };
  } catch (error) {
    console.warn(
      `[VISIBILITY] Wishlist inaccessible pour ${steamId}:`,
      error?.message || error
    );
    return {
      visible: false,
      count: 0,
      items: [],
    };
  }
}

/**
 * Endpoint léger pour vérifier les versions de données.
 * Lecture Mongo only (pas d'appel API Steam externe) → skip du steamLimiter
 * strict (10/min) via STEAM_LIMITER_SKIP_PATHS, fallback sur apiLimiter (60/min)
 * appliqué ici en route-level pour préserver la protection brute-force.
 */
router.get('/status/:steamId', apiLimiter, validateSteamId, async (req, res) => {
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

router.get('/games/:steamId', apiLimiter, validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    if (SIMULATION_CONFIG.privateProfile) {
      console.log(`[LOCKED] [SIMULATION] Route /games → réponse vide (profil privé simulé)`);
      return res.json([]);
    }

    const shouldRefreshRecent =
      req.query?.refresh === 'recent' ||
      req.query?.refresh === '1' ||
      req.query?.refresh === 'true';

    if (shouldRefreshRecent) {
      const userForRefresh = await User.findOne({ steamId });
      if (!userForRefresh) {
        return res.status(404).json({ message: 'Utilisateur non trouvé' });
      }

      await syncUserGames(userForRefresh, {
        force: true,
        reason: 'api:/steam/games?refresh=recent',
      });
    }

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
      .select('appId name img_icon_url header_image')
      .lean();

    const gamesMap = new Map(gamesData.map((g) => [g.appId, g]));

    // Lazy loading : enrichir les jeux sans header_image en base (uniquement ceux jamais tentés)
    // 'none' = déjà tenté, pas d'image dispo → on ne réessaie pas
    const gamesToEnrich = gamesData.filter((g) => !g.header_image);
    if (gamesToEnrich.length > 0) {
      const BATCH_SIZE = 5;
      let enrichedCount = 0;

      for (let i = 0; i < gamesToEnrich.length; i += BATCH_SIZE) {
        const batch = gamesToEnrich.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map((g) => fetchGameDetails(g.appId).catch(() => null))
        );

        const bulkOps = [];
        for (let j = 0; j < batch.length; j++) {
          const headerImage = results[j]?.header_image || 'none';
          bulkOps.push({
            updateOne: {
              filter: { appId: batch[j].appId },
              update: { $set: { header_image: headerImage } },
            },
          });
          if (results[j]?.header_image) {
            batch[j].header_image = results[j].header_image;
            enrichedCount++;
          }
        }

        await Game.bulkWrite(bulkOps, { ordered: false });
      }

      if (enrichedCount > 0) {
        console.log(`[LAZY] ${enrichedCount}/${gamesToEnrich.length} jeux enrichis avec header_image`);
      }
    }

    const games = userGames.map((userGame) => {
      const gameData = gamesMap.get(userGame.gameId);
      const rawLastPlayed = Number(userGame.rtime_last_played);
      const normalizedLastPlayed =
        Number.isFinite(rawLastPlayed) && rawLastPlayed > 0
          ? rawLastPlayed
          : null;

      return {
        appid: userGame.gameId,
        name: gameData?.name || `Game ${userGame.gameId}`,
        img_icon_url: gameData?.img_icon_url || '',
        header_image: gameData?.header_image || '',
        playtime_forever: userGame.playtime_forever || 0,
        rtime_last_played: normalizedLastPlayed,
        playtime_2weeks: userGame.playtime_2weeks || 0,
        hasPlaytimeData: Boolean(userGame.hasPlaytimeData),
        isFamilyShared: Boolean(userGame.isFamilyShared),
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
router.get('/wishlist/:steamId', apiLimiter, validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    if (SIMULATION_CONFIG.privateProfile) {
      console.log(`[LOCKED] [SIMULATION] Route /wishlist → réponse vide (profil privé simulé)`);
      return res.json([]);
    }

    const user = await User.findOne({ steamId })
      .select('wishlist followedGames')
      .lean();

    if (!user?.wishlist?.games || user.wishlist.games.length === 0) {
      console.log('[INFO] Wishlist vide');
      return res.json([]);
    }

    const gameIds = user.wishlist.games.map((g) => g.gameId);
    const wishlistGames = await Wishlist.find({
      appId: { $in: gameIds },
    }).lean();

    const followedSet = new Set(getFollowedAppIds(user));

    const result = user.wishlist.games
      .map((userGame) => {
        const gameData = wishlistGames.find((g) => g.appId === userGame.gameId);
        if (!gameData) return null;

        return {
          appid: parseInt(userGame.gameId, 10),
          name: gameData.name || `Game ${userGame.gameId}`,
          capsule: gameData.header_image || '',
          header_image: gameData.header_image || '',
          date_added: userGame.date_added,
          priority: userGame.priority,
          isFollowed: followedSet.has(userGame.gameId),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.date_added - a.date_added);

    console.log(`[OK] ${result.length} jeux retournés depuis BDD`);
    res.json(result);
  } catch (error) {
    console.error('Erreur dans /wishlist/:steamId:', error);
    res.status(500).json({ message: 'Erreur serveur' });
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

    if (q.trim().length > 100) {
      return res.status(400).json({
        message: 'La recherche ne peut pas dépasser 100 caractères',
      });
    }

    const results = await steamService.searchGames(
      q.trim(),
      clampQueryInt(limit, 5, 1, 20)
    );

    res.json(results);
  } catch (error) {
    console.error('Erreur dans /search:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Vérifier la visibilité du profil Steam et sync si public
router.post('/check-visibility/:steamId', validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    // Appel direct à l'API Steam pour tester l'accès aux jeux
    const games = await fetchUserGames(steamId);

    if (!games || games.length === 0) {
      const wishlistState = await getWishlistVisibilityState(steamId);

      if (wishlistState.visible) {
        await syncUserWishlist(steamId, wishlistState.items);
      }

      return res.json({
        visible: false,
        gamesVisible: false,
        gameDetailsVisible: wishlistState.visible,
        wishlistVisible: wishlistState.visible,
        playtimeVisible: false,
        gamesCount: 0,
        wishlistCount: wishlistState.count,
      });
    }

    const playtimeVisible = games.some(hasSteamPlaytimeFields);

    // Profil public — sync complet games + wishlist
    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    await syncUserGames(user, { force: true, reason: 'check-visibility' });
    await syncUserWishlist(steamId);

    console.log(`[OK] [CHECK-VISIBILITY] Profil public détecté pour ${steamId} — sync complet effectué`);

    res.json({
      visible: true,
      gamesVisible: true,
      gameDetailsVisible: true,
      playtimeVisible,
      gamesCount: games.length,
    });
  } catch (error) {
    console.error('Erreur dans /check-visibility:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/check-wishlist-visibility/:steamId', validateSteamId, async (req, res) => {
  try {
    const { steamId } = req.params;

    const [wishlistItems, games] = await Promise.all([
      fetchUserWishlist(steamId),
      fetchUserGames(steamId).catch((err) => {
        console.warn(
          `[CHECK-WISHLIST-VISIBILITY] fetchUserGames a échoué pour ${steamId}:`,
          err?.message || err
        );
        return [];
      }),
    ]);

    const wishlistVisible =
      Array.isArray(wishlistItems) && wishlistItems.length > 0;
    const gamesVisible = Array.isArray(games) && games.length > 0;

    if (!wishlistVisible && !gamesVisible) {
      return res.json({
        visible: false,
        wishlistVisible: false,
        gamesVisible: false,
        playtimeVisible: false,
        wishlistCount: 0,
        gamesCount: 0,
      });
    }

    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    if (wishlistVisible) {
      const syncResult = await syncUserWishlist(steamId, wishlistItems);
      if (!syncResult?.success) {
        return res.status(500).json({
          message: 'Erreur lors de la synchronisation de la wishlist',
        });
      }
    }

    if (gamesVisible) {
      await syncUserGames(user, {
        force: true,
        reason: 'check-wishlist-visibility',
      });
    }

    const playtimeVisible =
      gamesVisible && games.some(hasSteamPlaytimeFields);

    res.json({
      visible: wishlistVisible,
      wishlistVisible,
      gamesVisible,
      playtimeVisible,
      wishlistCount: wishlistVisible ? wishlistItems.length : 0,
      gamesCount: gamesVisible ? games.length : 0,
    });
  } catch (error) {
    console.error('Erreur dans /check-wishlist-visibility:', error);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
