const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const Game = require('../models/Game');
const {
  getFollowedGamesDetailsBySteamId,
} = require('../services/users/followedGamesDetailsService');
const {
  getFollowedAppIds,
  buildFollowedGamesEntry,
} = require('../utils/followedGamesHelpers');
const { isValidSteamId, isValidAppId } = require('../middleware/steamValidators');
const {
  addUserToGameSubscription,
  removeUserFromGameSubscription,
} = require('../services/users/subscriptionManager');
const {
  buildNotificationSettingsPatch,
  applyNotificationSettingsPatchToUser,
} = require('../services/users/userNotificationSettingsService');
const {
  isSupportedAppLanguage,
  normalizeAppLanguage,
  SUPPORTED_LANGUAGES,
} = require('../utils/language');
const logger = require('../utils/logger');

// SECURITY: there is intentionally NO steamId->token endpoint here. A SteamID is
// public, so minting a session from it alone let anyone with the /feed/<steamId>
// URL act on the account (incl. delete). The web view now obtains its session
// only through verified Steam OpenID (see /auth/steam/start + /auth/steam/return,
// platform=web). The endpoints below stay public-by-steamId because the
// Millennium plugin polls them in the background (no token there) — they are
// low-severity (read-only mostly-public data + idempotent follow + presence) and
// can never delete the account or change settings, which require the session.

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
        steamNotifications: settings.steamNotifications !== false,
        preferSteamWhenOpen: Boolean(settings.preferSteamWhenOpen),
        confirmUnfollowGames: settings.confirmUnfollowGames !== false,
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
 * Heartbeat from the Millennium plugin — marks Steam Desktop as currently open.
 * Used by the presence-based dedup: when preferSteamWhenOpen is on and this was
 * seen recently, the mobile FCM push is skipped (the Steam toast covers it).
 * GET (not POST) because the plugin's Lua proxy only does http.get reliably.
 */
router.get('/heartbeat/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    await User.updateOne({ steamId }, { $set: { lastSteamSeenAt: new Date() } });
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'web_heartbeat_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * Lightweight public read of the notification gates. Polled by the Millennium
 * plugin before toasting (avoids loading the full profile every 5 min).
 */
router.get('/settings/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    const user = await User.findOne({ steamId })
      .select('notificationSettings.newsNotifications notificationSettings.steamNotifications')
      .lean();
    const settings = user?.notificationSettings || {};
    res.json({
      newsNotifications: Boolean(settings.newsNotifications),
      steamNotifications: settings.steamNotifications !== false,
    });
  } catch (error) {
    logger.error({ err: error }, 'web_settings_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * Public follow-by-SteamID. Used by the Millennium plugin's "nouveau jeu
 * détecté" toast (click to follow). Trusts the SteamID — same accepted
 * tradeoff as the zero-click session on the Steam Desktop surface. Idempotent.
 *
 * Exposed as BOTH GET (query params) and POST (body): the Millennium plugin's
 * Lua proxy only does http.get reliably (http.request crashes the native
 * layer), so the plugin calls the GET form.
 */
async function handleFollow(params, res) {
  try {
    const { steamId, appId, name, logoUrl } = params;
    if (!isValidSteamId(String(steamId || ''))) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    if (!isValidAppId(String(appId || ''))) {
      return res.status(400).json({ message: 'AppID invalide' });
    }
    const appIdStr = String(appId);

    const user = await User.findOne({ steamId }).select('followedGames').lean();
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    if (getFollowedAppIds(user).includes(appIdStr)) {
      return res.json({ ok: true, alreadyFollowed: true });
    }

    // Atomic push guarded on absence — no duplicate even under a race.
    await User.findOneAndUpdate(
      { steamId, 'followedGames.appId': { $ne: appIdStr } },
      {
        $push: { followedGames: buildFollowedGamesEntry(appIdStr) },
        $set: { gamesVersion: new Date() },
      },
    );
    await addUserToGameSubscription(appIdStr, steamId, name, logoUrl);

    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'web_follow_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
}

router.get('/follow', (req, res) => handleFollow(req.query, res));
router.post('/follow', (req, res) => handleFollow(req.body || {}, res));

// ── Public-by-SteamID writes (Steam Desktop / Millennium surface) ───────────
// The feed runs full-page inside the Steam Desktop client (Millennium plugin),
// where the user is already authenticated as themselves — so these mirror the
// session-gated /api/users writes but trust the SteamID, same accepted tradeoff
// as /follow above. They reuse the exact same services as the authed routes.
// Account DELETION is intentionally NOT mirrored here (destructive) — it stays
// session-only on /api/users/:steamId.

// Ne plus suivre un jeu
router.delete('/follow/:steamId/:appId', async (req, res) => {
  try {
    const { steamId, appId } = req.params;
    if (!isValidSteamId(steamId) || !isValidAppId(String(appId || ''))) {
      return res.status(400).json({ message: 'Paramètres invalides' });
    }
    const updatedUser = await User.findOneAndUpdate(
      { steamId, 'followedGames.appId': appId },
      {
        $pull: { followedGames: { appId } },
        $set: { gamesVersion: new Date() },
      },
      { new: true },
    );
    if (!updatedUser) {
      return res.status(404).json({ message: "Ce jeu n'est pas suivi" });
    }
    await removeUserFromGameSubscription(appId, steamId);
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'web_unfollow_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Réglages de notification
router.put('/notifications/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    const parsed = buildNotificationSettingsPatch(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ message: parsed.message });
    }
    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    applyNotificationSettingsPatchToUser(user, parsed.patch);
    await user.save();
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'web_notifications_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Langue
router.put('/language/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    const { language } = req.body || {};
    if (!isSupportedAppLanguage(language)) {
      return res.status(400).json({
        message: `language doit être l'une de: ${SUPPORTED_LANGUAGES.join(', ')}`,
      });
    }
    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    user.language = normalizeAppLanguage(language);
    await user.save();
    res.json({ ok: true, language: user.language });
  } catch (error) {
    logger.error({ err: error }, 'web_language_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Ajouter une news aux favoris
router.post('/news-favorites/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    const { appId, newsId, newsDate } = req.body || {};
    if (!isValidSteamId(steamId) || !appId || !newsId || !newsDate) {
      return res.status(400).json({ message: 'Paramètres invalides' });
    }
    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    if (!Array.isArray(user.newsFavorites)) {
      user.newsFavorites = [];
    }
    const exists = user.newsFavorites.some(
      (fav) => fav.appId === appId && fav.newsId === newsId,
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
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'web_favorite_add_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Retirer une news des favoris
router.delete('/news-favorites/:steamId/:appId/:newsId', async (req, res) => {
  try {
    const { steamId, appId, newsId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    const user = await User.findOne({ steamId });
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    if (Array.isArray(user.newsFavorites) && user.newsFavorites.length > 0) {
      user.newsFavorites = user.newsFavorites.filter(
        (fav) => !(fav.appId === appId && fav.newsId === newsId),
      );
      await user.save();
    }
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'web_favorite_remove_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Marquer le fil d'actu comme vu (high-water-mark, ne recule jamais)
router.put('/news-seen/:steamId', async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    const { seenAt } = req.body || {};
    const ts = seenAt ? new Date(seenAt) : new Date();
    if (Number.isNaN(ts.getTime())) {
      return res.status(400).json({ message: 'seenAt invalide' });
    }
    await User.findOneAndUpdate(
      {
        steamId,
        $or: [{ lastNewsFeedSeenAt: null }, { lastNewsFeedSeenAt: { $lt: ts } }],
      },
      { $set: { lastNewsFeedSeenAt: ts } },
    );
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'web_news_seen_failed');
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
