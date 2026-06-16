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
  getMutedAppIds,
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
const {
  registerOrUpdateUser,
} = require('../services/steam/steamUserManager');
const {
  getPendingFollowPrompts,
} = require('../services/followPromptService');
const {
  checkProfileVisibilityAndSync,
  checkWishlistVisibilityAndSync,
} = require('../services/steam/visibilityCheckService');
const { isAdminSteamId } = require('../utils/adminAccess');
const logger = require('../utils/logger');

// SECURITY: there is intentionally NO steamId->token endpoint here. A SteamID is
// public, so minting a session from it alone let anyone with the /feed/<steamId>
// URL act on the account. The web view obtains its session only through verified
// Steam OpenID (see /auth/steam/start + /auth/steam/return, platform=web).
// WRITES below are fail-closed via requireWebAuth: a bare SteamID is never enough
// — they require a Bearer session bound to the SteamID OR a valid Millennium
// pairing secret (the plugin's Lua proxy attaches ?secret= to every call). Only
// near-public READS (profile/library) stay soft-gated, and bootstrap routes
// (pair/register) + the single-boolean follow-state read stay open.

// ── Privacy par appairage (TOFU) ────────────────────────────────────────────
// Le token web Steam etant INRECUPERABLE depuis un plugin Millennium, le plugin
// prouve son identite via un secret par-installation, genere localement et
// enregistre une fois (GET /pair). Les lectures sensibles (profile/library/news)
// exigent ensuite le header X-GN-Secret. Tant qu'aucun secret n'est enregistre,
// la surface reste publique (compat, rollout non-cassant). Voir middleware/
// webPairSecret.js.
const {
  hashSecret,
  generatePairSecret,
  secretMatches,
  requireWebSecretIfPaired,
  requireWebAuth,
} = require('../middleware/webPairSecret');

// Appairage du plugin : pose le hash du secret au 1er appel (premier arrive
// gagne, TOFU), accepte les appels suivants si le secret correspond. GET car le
// proxy Lua du plugin ne fait que http.get.
async function handlePair(params, res) {
  const { steamId, secret } = params;
  if (!isValidSteamId(String(steamId || ''))) {
    return res.status(400).json({ message: 'SteamID invalide' });
  }
  // Secret fourni = ancien flux (le plugin envoie toujours ses 40 hex). Absent
  // = nouveau flux Option A : le backend mint un secret CSPRNG (entropie forte,
  // independante du sandbox Lua du plugin) et le renvoie une seule fois.
  const hasSecret = typeof secret === 'string' && secret.length >= 16;
  try {
    const user = await User.findOne({ steamId }).select('+webPairSecretHash');
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    // ── Pas de secret fourni : generation serveur ───────────────────────────
    if (!hasSecret) {
      if (!user.webPairSecretHash) {
        const generated = generatePairSecret();
        user.webPairSecretHash = hashSecret(generated);
        await user.save();
        // Seul moment ou le secret transite : a la creation, en HTTPS. Ensuite
        // on n'en garde que le hash, donc rien a renvoyer aux appels suivants.
        return res.json({ ok: true, paired: true, secret: generated });
      }
      // Deja appaire : on ne connait que le hash, on ne peut/doit rien renvoyer.
      return res.json({ ok: true, alreadyPaired: true });
    }

    // ── Secret fourni : flux TOFU historique (retrocompat plugins existants) ─
    if (!user.webPairSecretHash) {
      user.webPairSecretHash = hashSecret(secret);
      await user.save();
      return res.json({ ok: true, paired: true });
    }
    if (secretMatches(secret, user.webPairSecretHash)) {
      return res.json({ ok: true, paired: true });
    }
    return res.status(403).json({ message: 'secret incorrect (déjà appairé)' });
  } catch (error) {
    logger.error({ err: error }, 'web_pair_failed');
    return res.status(500).json({ message: 'Erreur serveur' });
  }
}

// Le secret peut arriver en query (?secret=) ou en header X-GN-Secret (le proxy
// Lua du plugin l'ajoute automatiquement sur tous ses appels).
router.get('/pair', (req, res) =>
  handlePair({ steamId: req.query.steamId, secret: req.query.secret || req.get('x-gn-secret') }, res),
);
router.post('/pair', (req, res) =>
  handlePair(
    { steamId: (req.body || {}).steamId, secret: (req.body || {}).secret || req.get('x-gn-secret') },
    res,
  ),
);

/**
 * Consolidated public read-only profile for the web view (Suivre + Compte
 * tabs). One round-trip returns followed games, wishlist and account basics.
 * No auth — same rationale as /feed: followed games & wishlist are public on
 * steamcommunity.com. News are intentionally NOT here (they require slow live
 * Steam calls — served separately by /api/news/feed-by-steamid).
 */
router.get('/profile/:steamId', requireWebSecretIfPaired, async (req, res) => {
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
        isAdmin: isAdminSteamId(steamId),
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
router.get('/heartbeat/:steamId', requireWebAuth, async (req, res) => {
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
 * Server-authoritative follow-prompt toasts for the Millennium plugin. Returns
 * ONLY the "nouveau jeu détecté → clic pour suivre" candidates to toast now —
 * deduped across surfaces (skips games already prompted on mobile `pushedAt` or
 * desktop `toastedAt`) with a one-time silent seed (`User.followPromptSeededAt`).
 * Replaces the plugin's local `gamenews_prompted_ids` set. GET with a side
 * effect (claims/marks the returned games), same pattern as heartbeat/news-seen.
 */
router.get('/follow-prompts/:steamId', requireWebSecretIfPaired, async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    const items = await getPendingFollowPrompts(steamId);
    res.json({ items });
  } catch (error) {
    logger.error({ err: error }, 'web_follow_prompts_failed');
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
 * Follow-by-SteamID. Used by the Millennium plugin's "nouveau jeu détecté" toast
 * (click to follow) and the store-page bell. Gated by requireWebAuth (secret or
 * Bearer) — see the wiring below. Idempotent.
 *
 * Exposed as BOTH GET (query params) and POST (body): the Millennium plugin's
 * Lua proxy only does http.get reliably (http.request crashes the native
 * layer), so the plugin calls the GET form.
 */
async function handleFollow(params, res) {
  try {
    const { steamId, appId, name, logoUrl, notifications } = params;
    if (!isValidSteamId(String(steamId || ''))) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    if (!isValidAppId(String(appId || ''))) {
      return res.status(400).json({ message: 'AppID invalide' });
    }
    const appIdStr = String(appId);
    // `notifications=false` (query string du proxy Lua) ou `false` (body JSON)
    // = suivi silencieux (bouton +). Absent/autre = notifié (rétrocompat).
    const wantsNotifications = !(
      notifications === false || String(notifications).toLowerCase() === 'false'
    );

    const user = await User.findOne({ steamId }).select('followedGames').lean();
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    if (getFollowedAppIds(user).includes(appIdStr)) {
      return res.json({ ok: true, alreadyFollowed: true });
    }

    // Atomic push guarded on absence — no duplicate even under a race.
    // Pas de bump gamesVersion (un suivi ne change pas la bibliothèque) ;
    // followVersion bumpé pour propager le suivi aux autres surfaces (le mobile
    // re-fetch son profil sans recharger la bibliothèque).
    await User.findOneAndUpdate(
      { steamId, 'followedGames.appId': { $ne: appIdStr } },
      {
        $push: {
          followedGames: buildFollowedGamesEntry(appIdStr, wantsNotifications),
        },
        $set: { followVersion: new Date() },
      },
    );
    await addUserToGameSubscription(appIdStr, steamId, name, logoUrl);

    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error }, 'web_follow_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
}

router.get('/follow', requireWebAuth, (req, res) => handleFollow(req.query, res));
router.post('/follow', requireWebAuth, (req, res) => handleFollow(req.body || {}, res));

/**
 * Public follow-state read for ONE game — drives the extension's store-page bell
 * (empty vs green). Ungated on purpose: it returns a single boolean, strictly
 * less sensitive than the already-public follow writes above and than /profile
 * (which exposes the whole followed list + wishlist). It must also work for
 * accounts pair-locked by the Millennium plugin, which would 403 the secret-less
 * extension on /profile — so the bell cannot depend on /profile.
 */
router.get('/follow-state/:steamId/:appId', async (req, res) => {
  try {
    const { steamId, appId } = req.params;
    if (!isValidSteamId(steamId) || !isValidAppId(String(appId || ''))) {
      return res.status(400).json({ message: 'Paramètres invalides' });
    }
    const user = await User.findOne({ steamId }).select('followedGames').lean();
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    const appIdStr = String(appId);
    const followed = getFollowedAppIds(user).includes(appIdStr);
    res.json({
      followed,
      // false = suivi silencieux (bouton + sans cloche). Toujours false si non
      // suivi — le client lit `followed` d'abord.
      notifications: followed && !getMutedAppIds(user).has(appIdStr),
    });
  } catch (error) {
    logger.error({ err: error }, 'web_follow_state_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * Bascule notifications d'un jeu DÉJÀ suivi (cloche on/off sans désabonner) —
 * jumeau public-by-SteamID du PUT /api/users/:id/follow/:appId/notifications.
 * Même modèle de confiance que les writes follow ci-dessus. GET exposé pour le
 * proxy Lua http.get-only du plugin (`?enabled=true|false`), POST pour le SPA.
 */
async function handleFollowNotifications(params, res) {
  try {
    const { steamId, appId, enabled } = params;
    if (!isValidSteamId(String(steamId || ''))) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    if (!isValidAppId(String(appId || ''))) {
      return res.status(400).json({ message: 'AppID invalide' });
    }
    const normalized =
      enabled === true || String(enabled).toLowerCase() === 'true'
        ? true
        : enabled === false || String(enabled).toLowerCase() === 'false'
        ? false
        : null;
    if (normalized === null) {
      return res
        .status(400)
        .json({ message: 'enabled (true|false) est requis' });
    }

    const appIdStr = String(appId);
    // Update positionnel atomique : ne matche que si le jeu est suivi.
    // followVersion bumpé pour propager le changement aux autres surfaces.
    const result = await User.updateOne(
      { steamId, 'followedGames.appId': appIdStr },
      {
        $set: {
          'followedGames.$.notifications': normalized,
          followVersion: new Date(),
        },
      }
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Ce jeu n'est pas suivi" });
    }

    res.json({ ok: true, appId: appIdStr, notifications: normalized });
  } catch (error) {
    logger.error({ err: error }, 'web_follow_notifications_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
}

router.get('/follow-notifications/:steamId/:appId', requireWebAuth, (req, res) =>
  handleFollowNotifications(
    { steamId: req.params.steamId, appId: req.params.appId, enabled: req.query.enabled },
    res,
  ),
);
router.post('/follow-notifications/:steamId/:appId', requireWebAuth, (req, res) =>
  handleFollowNotifications(
    {
      steamId: req.params.steamId,
      appId: req.params.appId,
      // enabled accepté dans le body (SPA web envoie sans body utile) OU en
      // query (?enabled=) : l'extension et le SPA postent le flag en query.
      enabled: (req.body || {}).enabled ?? req.query.enabled,
    },
    res,
  ),
);

/**
 * Public, idempotent account provisioning for the Steam Desktop surface.
 *
 * Reuses the SAME path as the OpenID/mobile registration (registerOrUpdateUser):
 * on a brand-new install it creates the account and kicks off the initial Steam
 * library sync; for an existing user it is a no-op. Trusts the SteamID like the
 * other /api/web endpoints — being inside the signed-in Steam client is the
 * proof of identity, so no login is needed (the Millennium plugin calls this
 * once at boot). GET is exposed because the plugin's Lua proxy only does
 * http.get reliably (see /follow).
 *
 * Provisioning runs in the BACKGROUND and we reply 202 immediately: the first
 * library sync can exceed the plugin's short HTTP timeout, and the plugin does
 * not need to wait for it. The call is idempotent and re-issued every boot, so
 * a transient failure self-heals on the next launch.
 */
function handleRegister(steamId, res) {
  if (!isValidSteamId(String(steamId || ''))) {
    return res.status(400).json({ message: 'SteamID invalide' });
  }
  registerOrUpdateUser(steamId).catch((error) => {
    logger.error({ err: error }, 'web_register_failed');
  });
  return res.status(202).json({ ok: true });
}

router.get('/register/:steamId', (req, res) => handleRegister(req.params.steamId, res));
router.post('/register/:steamId', (req, res) => handleRegister(req.params.steamId, res));

// ── /api/web writes (Steam Desktop / Millennium + web + extension) ──────────
// These mirror the session-gated /api/users writes and reuse the exact same
// services, but are reached from surfaces that prove identity differently: the
// plugin via its pairing secret, the browser/extension via a Bearer session.
// All are fail-closed through requireWebAuth (see the wiring on each route) — a
// bare SteamID is rejected. Account DELETION is intentionally NOT mirrored here
// (destructive) — it stays session-only on /api/users/:steamId.

// Ne plus suivre un jeu. Exposé en DELETE (extension/web fetch) ET en GET
// (/unfollow/:id/:appId) : le proxy Lua du plugin Millennium ne fait que
// http.get, donc la cloche desktop désuit via le GET — même contrat que /follow.
async function handleUnfollow(steamId, appId, res) {
  try {
    if (!isValidSteamId(steamId) || !isValidAppId(String(appId || ''))) {
      return res.status(400).json({ message: 'Paramètres invalides' });
    }
    const updatedUser = await User.findOneAndUpdate(
      { steamId, 'followedGames.appId': appId },
      {
        $pull: { followedGames: { appId } },
        $set: { followVersion: new Date() },
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
}

router.delete('/follow/:steamId/:appId', requireWebAuth, (req, res) =>
  handleUnfollow(req.params.steamId, req.params.appId, res),
);
router.get('/unfollow/:steamId/:appId', requireWebAuth, (req, res) =>
  handleUnfollow(req.params.steamId, req.params.appId, res),
);

// Réglages de notification
router.put('/notifications/:steamId', requireWebAuth, async (req, res) => {
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
router.put('/language/:steamId', requireWebAuth, async (req, res) => {
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
router.post('/news-favorites/:steamId', requireWebAuth, async (req, res) => {
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
router.delete('/news-favorites/:steamId/:appId/:newsId', requireWebAuth, async (req, res) => {
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
router.put('/news-seen/:steamId', requireWebAuth, async (req, res) => {
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
router.get('/library/:steamId', requireWebSecretIfPaired, async (req, res) => {
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

/**
 * "Vérifier mon profil" pour le client Steam Desktop / web / extension — jumeau
 * de POST /api/steam/check-visibility (mobile, session). Teste la visibilité du
 * profil Steam et lance le sync si c'est devenu public. Réutilise EXACTEMENT le
 * même service que la route mobile (visibilityCheckService) — aucune logique
 * dupliquée. Gardé par requireWebAuth (fail-closed) : le sync forcé est une
 * écriture, un SteamID nu ne suffit jamais. POST uniquement (le SPA tourne dans
 * un contexte navigateur qui sait poser X-GN-Secret / Bearer ; pas de contrainte
 * GET-only du proxy Lua ici, contrairement à follow/unfollow).
 */
router.post('/check-visibility/:steamId', requireWebAuth, async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    const result = await checkProfileVisibilityAndSync(steamId);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.json(result.body);
  } catch (error) {
    logger.error({ err: error }, 'web_check_visibility_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

router.post('/check-wishlist-visibility/:steamId', requireWebAuth, async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    const result = await checkWishlistVisibilityAndSync(steamId);
    if (!result.ok) {
      return res.status(result.status).json({ message: result.message });
    }
    res.json(result.body);
  } catch (error) {
    logger.error({ err: error }, 'web_check_wishlist_visibility_failed');
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

/**
 * Admin-only "refresh my account" for the Steam Desktop plugin / web SPA.
 * Runs the same per-user sync as the cron (library + Steam Family + wishlist),
 * on demand. Double-gated: the per-install pairing secret (requireWebSecretIfPaired,
 * proving it's the real paired install) AND the SteamID being in ADMIN_STEAM_IDS.
 * Non-destructive (only refreshes the caller's own data). POST: the web SPA uses
 * browser fetch (supports the X-GN-Secret header), so no GET-only constraint here.
 */
router.post('/admin/refresh/:steamId', requireWebSecretIfPaired, async (req, res) => {
  try {
    const { steamId } = req.params;
    if (!isValidSteamId(steamId)) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    if (!isAdminSteamId(steamId)) {
      return res.status(403).json({ message: 'Accès admin refusé' });
    }
    // Lazy-require (see mobileAdmin): avoids pulling the Steam sync stack at
    // module load — only loaded when an admin actually triggers a refresh.
    const { refreshUserAccount } = require('../services/accountRefreshService');
    const result = await refreshUserAccount(steamId);
    return res.status(result.ok ? 200 : 500).json(result);
  } catch (error) {
    logger.error({ err: error }, 'web_admin_refresh_failed');
    return res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;
