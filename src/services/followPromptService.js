const User = require('../models/User');
const Game = require('../models/Game');
const Wishlist = require('../models/Wishlist');
const FollowPromptState = require('../models/FollowPromptState');
const { getFollowedAppIds } = require('../utils/followedGamesHelpers');
const logger = require('../utils/logger');

/**
 * Server-authoritative "which follow-prompts should the Steam Desktop plugin
 * toast?" — the single source of truth that replaces the plugin's local
 * `gamenews_prompted_ids` localStorage set and its silent seed.
 *
 * Candidates = unfollowed games from the library (if libraryFollowMode==='prompt')
 * and the wishlist (if wishlistFollowMode==='prompt'). Rules mirror the news
 * desktop toasts:
 *   - FIRST call ever (no `followPromptSeededAt`): mark every current candidate
 *     as delivered (silently), toast nothing — avoids flooding the backlog.
 *   - Afterwards: return only candidates not yet prompted on ANY surface (no
 *     `pushedAt` mobile, no `toastedAt` desktop), and mark them `toastedAt`.
 */
async function getPendingFollowPrompts(steamId) {
  const user = await User.findOne({ steamId })
    .select(
      'followedGames notificationSettings.libraryFollowMode ' +
        'notificationSettings.wishlistFollowMode gameLibrary wishlist ' +
        'followPromptSeededAt'
    )
    .lean();
  if (!user) {
    return [];
  }

  const settings = user.notificationSettings || {};
  const followed = new Set(getFollowedAppIds(user).map(String));

  const candidateIds = [];
  const seen = new Set();
  const addId = (rawId) => {
    const appId = String(rawId);
    if (appId && !followed.has(appId) && !seen.has(appId)) {
      seen.add(appId);
      candidateIds.push(appId);
    }
  };
  if (settings.libraryFollowMode === 'prompt') {
    (user.gameLibrary?.games || []).forEach((g) => addId(g.gameId));
  }
  if (settings.wishlistFollowMode === 'prompt') {
    (user.wishlist?.games || []).forEach((g) => addId(g.gameId));
  }
  if (candidateIds.length === 0) {
    return [];
  }

  const now = new Date();
  const seeded = Boolean(user.followPromptSeededAt);

  // First contact: silently mark the whole current backlog as delivered.
  if (!seeded) {
    await FollowPromptState.bulkWrite(
      candidateIds.map((appId) => ({
        updateOne: {
          filter: { steamId, appId },
          update: { $set: { toastedAt: now } },
          upsert: true,
        },
      })),
      { ordered: false }
    ).catch((err) => logger.error({ err, steamId }, 'follow_prompt_seed_failed'));
    await User.updateOne(
      { steamId },
      { $set: { followPromptSeededAt: now } }
    );
    return [];
  }

  const rows = await FollowPromptState.find({ steamId, appId: { $in: candidateIds } })
    .select('appId pushedAt toastedAt')
    .lean();
  const delivered = new Set(
    rows.filter((r) => r.pushedAt || r.toastedAt).map((r) => r.appId)
  );

  const toToast = candidateIds.filter((appId) => !delivered.has(appId));
  if (toToast.length === 0) {
    return [];
  }

  await FollowPromptState.bulkWrite(
    toToast.map((appId) => ({
      updateOne: {
        filter: { steamId, appId },
        update: { $set: { toastedAt: now } },
        upsert: true,
      },
    })),
    { ordered: false }
  ).catch((err) => logger.error({ err, steamId }, 'follow_prompt_claim_failed'));

  // Resolve name + logo (Game for library entries, Wishlist for wishlist ones).
  const [games, wishes] = await Promise.all([
    Game.find({ appId: { $in: toToast } }).select('appId name header_image').lean(),
    Wishlist.find({ appId: { $in: toToast } }).select('appId name header_image').lean(),
  ]);
  const meta = new Map();
  games.forEach((g) => meta.set(g.appId, g));
  wishes.forEach((w) => {
    if (!meta.has(w.appId)) meta.set(w.appId, w);
  });

  return toToast.map((appId) => {
    const m = meta.get(appId);
    const img = m?.header_image && m.header_image !== 'none' ? m.header_image : '';
    return { appId, name: m?.name || `Game ${appId}`, logoUrl: img };
  });
}

module.exports = { getPendingFollowPrompts };
