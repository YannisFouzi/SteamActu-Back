const User = require('../models/User');
const Game = require('../models/Game');
const Wishlist = require('../models/Wishlist');
const FollowPromptState = require('../models/FollowPromptState');
const { getFollowedAppIds } = require('../utils/followedGamesHelpers');
const logger = require('../utils/logger');

/**
 * Follow-prompts ("nouveau jeu détecté → clic pour suivre") — ÉVÉNEMENTIEL.
 *
 * Principe : un follow-prompt existe UNIQUEMENT pour un jeu que le sync de
 * bibliothèque a vu comme RÉELLEMENT nouveau (`processAutoFollow`, qui appelle
 * `recordFollowPromptCandidates`). On ne dérive JAMAIS les candidats de la
 * bibliothèque entière — sinon désuivre un jeu possédé le ferait passer pour un
 * nouvel achat (bug). `FollowPromptState` est le registre cross-surface : une
 * row = « ce jeu a été détecté comme nouveau » ; `pushedAt`/`toastedAt` = livré
 * sur mobile/desktop.
 */

/**
 * Enregistre les jeux détectés comme nouveaux (au moment de la détection, côté
 * sync). Idempotent : `$setOnInsert` ne réécrit jamais une row existante, donc
 * un jeu déjà livré (pushedAt/toastedAt) ne re-prompte pas.
 */
async function recordFollowPromptCandidates(steamId, prompts) {
  const appIds = (prompts || [])
    .map((p) => String(p && p.appId ? p.appId : ''))
    .filter(Boolean);
  if (appIds.length === 0) {
    return;
  }
  await FollowPromptState.bulkWrite(
    appIds.map((appId) => ({
      updateOne: {
        filter: { steamId, appId },
        update: { $setOnInsert: { steamId, appId } },
        upsert: true,
      },
    })),
    { ordered: false }
  ).catch((err) => logger.error({ err, steamId }, 'follow_prompt_record_failed'));
}

/**
 * Ce que poll le plugin Steam Desktop : les candidats détectés non encore
 * livrés (ni push mobile `pushedAt`, ni toast desktop `toastedAt`) ET toujours
 * non suivis (détecté nouveau puis suivi entre-temps → on ne prompte plus). Les
 * renvoyés sont marqués `toastedAt`. AUCUN re-scan de la bibliothèque.
 */
async function getPendingFollowPrompts(steamId) {
  const user = await User.findOne({ steamId }).select('followedGames').lean();
  if (!user) {
    return [];
  }
  const followed = new Set(getFollowedAppIds(user).map(String));

  const rows = await FollowPromptState.find({
    steamId,
    pushedAt: null,
    toastedAt: null,
  })
    .select('appId')
    .lean();

  const toToast = rows
    .map((r) => String(r.appId))
    .filter((appId) => !followed.has(appId));
  if (toToast.length === 0) {
    return [];
  }

  const now = new Date();
  await FollowPromptState.bulkWrite(
    toToast.map((appId) => ({
      updateOne: {
        filter: { steamId, appId },
        update: { $set: { toastedAt: now } },
      },
    })),
    { ordered: false }
  ).catch((err) => logger.error({ err, steamId }, 'follow_prompt_claim_failed'));

  // Résolution nom + logo (Game pour la biblio, Wishlist en repli).
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

module.exports = { getPendingFollowPrompts, recordFollowPromptCandidates };
