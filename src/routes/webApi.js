const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const {
  getFollowedGamesDetailsBySteamId,
} = require('../services/users/followedGamesDetailsService');
const { getFollowedAppIds } = require('../utils/followedGamesHelpers');
const { isValidSteamId } = require('../middleware/steamValidators');
const logger = require('../utils/logger');

/**
 * Consolidated public read-only profile for the web view (Suivre + Compte
 * tabs). One round-trip returns followed games, wishlist and account basics.
 * No auth — same rationale as /feed: followed games & wishlist are public on
 * steamcommunity.com. News are intentionally NOT here (they require slow live
 * Steam calls — served separately by /api/news/feed-by-steamid).
 */
router.get('/profile/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }

    const user = await User.findOne({ steamId })
      .select('language notificationSettings wishlist followedGames')
      .lean();

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // ── Followed games ──────────────────────────────────────────────────────
    const followedResult = await getFollowedGamesDetailsBySteamId(steamId);
    const followedGames =
      followedResult.type === 'ok' ? followedResult.followedGames : [];

    // ── Wishlist (mirrors GET /api/steam/wishlist logic) ───────────────────
    let wishlist = [];
    const wishlistEntries = user.wishlist?.games || [];
    if (wishlistEntries.length > 0) {
      const gameIds = wishlistEntries.map((g) => g.gameId);
      const wishlistGames = await Wishlist.find({
        appId: { $in: gameIds },
      }).lean();
      const followedSet = new Set(getFollowedAppIds(user));
      const byAppId = new Map(wishlistGames.map((g) => [g.appId, g]));

      wishlist = wishlistEntries
        .map((entry) => {
          const data = byAppId.get(entry.gameId);
          if (!data) return null;
          return {
            appId: String(entry.gameId),
            name: data.name || `Game ${entry.gameId}`,
            header_image: data.header_image || '',
            date_added: entry.date_added,
            isFollowed: followedSet.has(entry.gameId),
          };
        })
        .filter(Boolean)
        .sort((a, b) => (b.date_added || 0) - (a.date_added || 0));
    }

    // ── Account basics (read-only) ─────────────────────────────────────────
    const settings = user.notificationSettings || {};

    res.json({
      steamId,
      language: user.language || 'fr',
      followedGames,
      wishlist,
      account: {
        followedCount: followedGames.length,
        wishlistCount: wishlist.length,
        newsNotifications: Boolean(settings.newsNotifications),
        libraryFollowMode: settings.libraryFollowMode || 'off',
        wishlistFollowMode: settings.wishlistFollowMode || 'off',
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'web_profile_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
