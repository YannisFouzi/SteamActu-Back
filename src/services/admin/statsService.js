/**
 * Service de statistiques pour les routes /admin.
 *
 * Lecture seule. Pas d'effets de bord. Toutes les queries sont idempotentes
 * et peuvent etre relancees sans risque.
 *
 * Strategie de counts :
 *   - `estimatedDocumentCount()` pour les totaux globaux (O(1), lit les metadata
 *     de la collection, parfait pour un dashboard ou une precision parfaite
 *     n'est pas requise). Voir:
 *     https://www.mongodb.com/docs/manual/reference/method/db.collection.estimatedDocumentCount/
 *   - Aggregation pipelines pour les breakdowns (tiers, followMode).
 *
 * Agenda v5 : on lit `agenda.jobs({ name })` qui retourne les Job instances
 * avec `.attrs.{nextRunAt,lastRunAt,lockedAt,failCount,failReason}` issus
 * de la collection `agendaJobs`.
 */

const User = require('../../models/User');
const Game = require('../../models/Game');
const GameSubscription = require('../../models/GameSubscription');
const Wishlist = require('../../models/Wishlist');
const UserNewsState = require('../../models/UserNewsState');
const { getAgenda, JOBS } = require('../../config/cron');

// Meme seuils que newsRotationService.js (§1) — source de verite cote service.
const TIER_HOT_MAX_AGE_DAYS = 30;
const TIER_WARM_MAX_AGE_DAYS = 60;

/**
 * Compte global rapide de tous les documents d'une collection Mongoose.
 * Utilise les metadata — pas de full scan.
 */
function estimatedCount(Model) {
  return Model.estimatedDocumentCount().exec();
}

/**
 * Overview : counts globaux + breakdowns legers par followMode.
 */
async function getOverview() {
  const [
    users,
    games,
    subscriptions,
    wishlists,
    newsStates,
    usersWithFcm,
    followedGamesAgg,
    libraryModeAgg,
    wishlistModeAgg,
  ] = await Promise.all([
    estimatedCount(User),
    estimatedCount(Game),
    estimatedCount(GameSubscription),
    estimatedCount(Wishlist),
    estimatedCount(UserNewsState),

    // Users ayant au moins un FCM token (= peuvent recevoir une notif push).
    // Champ `fcmTokens` nested sous `notificationSettings` dans le schema User.
    User.countDocuments({
      'notificationSettings.fcmTokens.0': { $exists: true },
    }).exec(),

    // Total de games suivis cumules (= somme des tailles de followedGames)
    User.aggregate([
      { $project: { count: { $size: { $ifNull: ['$followedGames', []] } } } },
      { $group: { _id: null, total: { $sum: '$count' } } },
    ]),

    User.aggregate([
      { $group: { _id: '$notificationSettings.libraryFollowMode', count: { $sum: 1 } } },
    ]),

    User.aggregate([
      { $group: { _id: '$notificationSettings.wishlistFollowMode', count: { $sum: 1 } } },
    ]),
  ]);

  return {
    counts: {
      users,
      games,
      gameSubscriptions: subscriptions,
      wishlists,
      userNewsStates: newsStates,
    },
    users: {
      withFcmToken: usersWithFcm,
      totalFollowedGames: followedGamesAgg[0]?.total ?? 0,
      libraryFollowMode: aggregationToMap(libraryModeAgg),
      wishlistFollowMode: aggregationToMap(wishlistModeAgg),
    },
  };
}

/**
 * Polling : repartition des GameSubscription par tier (hot/warm/cold) +
 * compte des jeux en cooldown erreur (nextNewsCheckAt > now + 10min mais
 * pas cold — heuristique : on flag ceux avec ancienne erreur potentielle).
 *
 * La logique de tier reproduit exactement celle de newsRotationService
 * pour rester coherent avec ce que le cron voit.
 */
async function getPolling() {
  const now = new Date();
  const hotCutoff = new Date(now.getTime() - TIER_HOT_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const warmCutoff = new Date(now.getTime() - TIER_WARM_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);

  // lastNewsTimestamp est stocke en secondes epoch (convention Steam news API)
  const hotTs = Math.floor(hotCutoff.getTime() / 1000);
  const warmTs = Math.floor(warmCutoff.getTime() / 1000);

  const [tierAgg, eligibleNow, pending] = await Promise.all([
    GameSubscription.aggregate([
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $eq: ['$lastNewsCheck', null] }, then: 'never_checked' },
                {
                  case: {
                    $and: [
                      { $eq: ['$lastNewsTimestamp', 0] },
                      { $ne: ['$lastNewsCheck', null] },
                    ],
                  },
                  then: 'cold_no_news',
                },
                { case: { $gte: ['$lastNewsTimestamp', hotTs] }, then: 'hot' },
                { case: { $gte: ['$lastNewsTimestamp', warmTs] }, then: 'warm' },
              ],
              default: 'cold',
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),

    // Eligibles maintenant : nextNewsCheckAt <= now OR null
    GameSubscription.countDocuments({
      $or: [{ nextNewsCheckAt: { $lte: now } }, { nextNewsCheckAt: null }],
    }).exec(),

    // En attente : nextNewsCheckAt > now
    GameSubscription.countDocuments({
      nextNewsCheckAt: { $gt: now },
    }).exec(),
  ]);

  return {
    tiers: aggregationToMap(tierAgg),
    eligibleNow,
    pending,
    cutoffs: {
      hotMaxAgeDays: TIER_HOT_MAX_AGE_DAYS,
      warmMaxAgeDays: TIER_WARM_MAX_AGE_DAYS,
    },
  };
}

/**
 * Crons : etat des 3 jobs Agenda (nextRunAt, lastRunAt, lockedAt, failCount).
 *
 * Retourne tableau ordonne par nom de job. Si Agenda n'est pas encore
 * initialise (tres tot au boot, ou test unitaire), on retourne une liste vide
 * plutot que de throw — les autres sections du dashboard restent utilisables.
 */
async function getCrons() {
  const agenda = getAgenda();
  if (!agenda) {
    return { initialized: false, jobs: [] };
  }

  const jobNames = Object.values(JOBS);
  const docs = await agenda.jobs({ name: { $in: jobNames } });

  const jobs = docs.map((job) => {
    const attrs = job.attrs || {};
    return {
      name: attrs.name,
      nextRunAt: attrs.nextRunAt || null,
      lastRunAt: attrs.lastRunAt || null,
      lastFinishedAt: attrs.lastFinishedAt || null,
      lockedAt: attrs.lockedAt || null,
      failCount: attrs.failCount || 0,
      failReason: attrs.failReason || null,
      repeatInterval: attrs.repeatInterval || null,
      repeatTimezone: attrs.repeatTimezone || null,
    };
  });

  // Tri stable par nom pour un output deterministe (facilite le diff en debug)
  jobs.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return { initialized: true, jobs };
}

/**
 * Collecte complete : appelee par GET /admin/stats.
 * Les 3 sections tournent en parallele — aucune ne depend d'une autre.
 */
async function getAllStats() {
  const startedAt = Date.now();
  const [overview, polling, crons] = await Promise.all([
    getOverview(),
    getPolling(),
    getCrons(),
  ]);

  return {
    overview,
    polling,
    crons,
    meta: {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Transforme `[{ _id: 'hot', count: 5 }, ...]` en `{ hot: 5, ... }`.
 * Les `_id` null/undefined sont mappes vers la cle 'unset' pour rester JSON-safe.
 */
function aggregationToMap(rows) {
  return rows.reduce((acc, row) => {
    const key = row._id == null ? 'unset' : String(row._id);
    acc[key] = row.count;
    return acc;
  }, {});
}

module.exports = {
  getOverview,
  getPolling,
  getCrons,
  getAllStats,
};
