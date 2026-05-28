const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const Game = require('../models/Game');
const {
  getFollowedGamesDetailsBySteamId,
} = require('../services/users/followedGamesDetailsService');
const { getFollowedAppIds } = require('../utils/followedGamesHelpers');
const { isValidSteamId } = require('../middleware/steamValidators');
const { createMobileSession } = require('../services/mobileSessionService');
const logger = require('../utils/logger');

/**
 * Zero-click session for the Steam Desktop web view: issues a session token
 * for a SteamID supplied by the Millennium plugin (which read it locally from
 * loginusers.vdf). NOTE: this trusts the SteamID without OpenID verification —
 * an accepted tradeoff for this surface (writes are low-severity: follow/
 * unfollow + notif prefs; data is already public-by-steamId on the read side).
 * The token is the same one mobileSessionAuth validates, so existing write
 * endpoints (follow/unfollow/settings) work unchanged.
 */
router.post('/session', (req, res) => {
  const steamId = req.body && req.body.steamId;
  if (!isValidSteamId(String(steamId || ''))) {
    return res.status(400).json({ message: 'SteamID invalide' });
  }
  const session = createMobileSession(steamId);
  return res.json({
    steamId,
    token: session.token,
    expiresAt: session.expiresAt,
  });
});

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

/**
 * Public read-only Steam library ("Mes jeux"). Lazy-loaded by the web view's
 * Suivre > Mes jeux sub-tab. Lightweight: joins gameLibrary entries with the
 * Game collection for name/image, no on-demand image enrichment.
 */
router.get('/library/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }

    const user = await User.findOne({ steamId })
      .select('gameLibrary')
      .lean();
    const entries = user?.gameLibrary?.games || [];
    if (entries.length === 0) {
      return res.json([]);
    }

    const gameIds = entries.map((g) => g.gameId);
    const gamesData = await Game.find({ appId: { $in: gameIds } })
      .select('appId name header_image img_icon_url')
      .lean();
    const byId = new Map(gamesData.map((g) => [g.appId, g]));

    const library = entries
      .map((entry) => {
        const data = byId.get(entry.gameId);
        return {
          appId: String(entry.gameId),
          name: data?.name || `Game ${entry.gameId}`,
          header_image: data?.header_image && data.header_image !== 'none'
            ? data.header_image
            : '',
          isFamilyShared: Boolean(entry.isFamilyShared),
          // Playtime fields drive the Mes jeux sorts (Top récents / Plus joués).
          playtimeForever: entry.playtime_forever || 0,
          playtime2weeks: entry.playtime_2weeks || 0,
          lastPlayed: Number(entry.rtime_last_played) || 0,
        };
      })
      .sort((a, b) => b.playtimeForever - a.playtimeForever);

    res.json(library);
  } catch (error) {
    logger.error({ err: error }, 'web_library_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
