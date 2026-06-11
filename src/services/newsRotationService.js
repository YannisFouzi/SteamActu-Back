/**
 * Service de rotation intelligente des vérifications d'actualités.
 *
 * Polling adaptatif : chaque jeu reçoit un cooldown entre deux checks
 * selon l'ancienneté de sa dernière news Steam (tier hot/warm/cold).
 * Le champ `nextNewsCheckAt` sur GameSubscription matérialise l'éligibilité.
 *
 * Ordre strict par jeu traité (§4 du plan) :
 *   1. Appel Steam (getGameNews)
 *   2. MAJ lastNewsTimestamp si news plus récente
 *   3. Calcul du tier sur la valeur FRAÎCHE
 *   4. Écriture lastNewsCheck + nextNewsCheckAt
 */

const GameSubscription = require('../models/GameSubscription');
const User = require('../models/User');
const UserNewsState = require('../models/UserNewsState');
const steamService = require('./steamService');
const { SteamApiError } = steamService;
const notificationService = require('./notifications/notificationService');
const { extractFirstImage } = require('./newsFeed/imageExtractor');
const logger = require('../utils/logger');

// ── Configuration ────────────────────────────────────────────────────────────

const CONFIG = {
  // Limite unique : nombre max d'appels Steam GetNewsForApp par exécution
  MAX_STEAM_NEWS_CALLS_PER_RUN: 200,

  PAUSE_BETWEEN_CALLS: 100,       // ms entre chaque appel Steam
  NEWS_COUNT_PER_GAME: 3,         // news à récupérer par jeu
  NOTIFICATION_BATCH_SIZE: 50,    // taille batch notifications parallèles

  // Seuils d'ancienneté de la dernière news (secondes → ms pour comparaison)
  TIER_HOT_MAX_AGE_DAYS: 30,     // news < 30 j → hot
  TIER_WARM_MAX_AGE_DAYS: 60,    // news 30–60 j → warm

  // Cooldowns par tier (ms)
  COOLDOWN_HOT_MS:  15 * 60 * 1000,          // 15 min
  COOLDOWN_WARM_MS:  3 * 60 * 60 * 1000,   //  3 h
  COOLDOWN_COLD_MS: 12 * 60 * 60 * 1000,   // 12 h

  // Retry sur erreur Steam (timeout, 5xx, réseau) : courte pour récupérer vite
  ERROR_RETRY_MS: 15 * 60 * 1000,           // 15 min

  // Jeu inaccessible côté Steam (403 NDA/privé, 404 retiré) : cooldown long
  // pour ne pas spammer l'API ni Sentry.
  UNAVAILABLE_RETRY_MS: 24 * 60 * 60 * 1000, // 24 h

  // Rate limit (429) : cooldown intermédiaire, silencieux.
  RATE_LIMIT_RETRY_MS: 60 * 60 * 1000,       //  1 h
};

// ── Helpers ──────────────────────────────────────────────────────────────────

let isRotationRunning = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Détermine le tier d'un jeu et retourne le cooldown associé.
 *
 * Règles (§1 + §4 du plan) :
 *   - lastNewsCheck == null → hot (jamais vérifié, priorité absolue)
 *   - lastNewsTimestamp === 0 && lastNewsCheck != null → cold (vérifié mais aucune news)
 *   - Sinon : ancienneté de lastNewsTimestamp vs seuils
 */
function getTierCooldown(lastNewsTimestamp, lastNewsCheck) {
  // Jamais vérifié → hot
  if (lastNewsCheck == null) {
    return { tier: 'hot', cooldownMs: CONFIG.COOLDOWN_HOT_MS };
  }

  // Vérifié mais aucune news connue (timestamp 0) → cold
  if (!lastNewsTimestamp) {
    return { tier: 'cold', cooldownMs: CONFIG.COOLDOWN_COLD_MS };
  }

  const ageMs = Date.now() - lastNewsTimestamp * 1000;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);

  if (ageDays < CONFIG.TIER_HOT_MAX_AGE_DAYS) {
    return { tier: 'hot', cooldownMs: CONFIG.COOLDOWN_HOT_MS };
  }
  if (ageDays < CONFIG.TIER_WARM_MAX_AGE_DAYS) {
    return { tier: 'warm', cooldownMs: CONFIG.COOLDOWN_WARM_MS };
  }
  return { tier: 'cold', cooldownMs: CONFIG.COOLDOWN_COLD_MS };
}

// ── Rotation principale ──────────────────────────────────────────────────────

/**
 * Vérifie les actualités avec rotation adaptative.
 * @returns {Promise<Object>} Statistiques de l'exécution
 */
async function checkNewsRotation() {
  if (isRotationRunning) {
    logger.warn('news_rotation_already_running');
    return {
      gamesChecked: 0,
      apiCalls: 0,
      newNewsFound: 0,
      notificationsSent: 0,
      skipped: true,
    };
  }

  isRotationRunning = true;

  try {
    logger.info('news_rotation_start');

    const startTime = Date.now();
    const now = new Date();

    // Requête éligibilité : nextNewsCheckAt null OU <= now
    // Tri : null en premier (jamais vérifiés), puis les plus anciennement éligibles
    const games = await GameSubscription.find({
      $or: [
        { nextNewsCheckAt: null },
        { nextNewsCheckAt: { $lte: now } },
      ],
    })
      .sort({ nextNewsCheckAt: 1, lastNewsCheck: 1 })
      .limit(CONFIG.MAX_STEAM_NEWS_CALLS_PER_RUN);

    logger.info({ eligibleGames: games.length }, 'news_rotation_eligible');

    if (games.length === 0) {
      return {
        gamesChecked: 0,
        apiCalls: 0,
        newNewsFound: 0,
        notificationsSent: 0,
        tiers: { hot: 0, warm: 0, cold: 0 },
      };
    }

    const stats = {
      gamesChecked: 0,
      apiCalls: 0,
      newNewsFound: 0,
      notificationsSent: 0,
      errors: [],
      tiers: { hot: 0, warm: 0, cold: 0 },
    };

    const gamesToUpdate = [];

    for (const game of games) {
      try {
        // §4 étape 1 : appel Steam
        const news = await steamService.getGameNews(
          game.gameId,
          CONFIG.NEWS_COUNT_PER_GAME
        );
        stats.apiCalls++;

        // §4 étape 2 : MAJ lastNewsTimestamp si news plus récente
        if (news && news.length > 0) {
          const latestNewsTimestamp = news[0].date || 0;
          const currentTimestamp = game.lastNewsTimestamp || 0;

          if (latestNewsTimestamp > currentTimestamp) {
            game.lastNewsTimestamp = latestNewsTimestamp;

            const firstImageUrl = extractFirstImage(news[0].contents);
            logger.info(
              {
                gameId: game.gameId,
                gameName: game.name,
                newTimestamp: latestNewsTimestamp,
                previousTimestamp: currentTimestamp,
              },
              'news_new_detected'
            );
            stats.newNewsFound++;

            await sendNotificationsForGame(game, news[0], firstImageUrl, stats);
          }
        }

        // §4 étape 3 : tier sur valeur FRAÎCHE
        const updateNow = new Date();
        const { tier, cooldownMs } = getTierCooldown(
          game.lastNewsTimestamp,
          updateNow // lastNewsCheck = now (on vient de vérifier)
        );
        stats.tiers[tier]++;

        // §4 étape 4 : écriture
        gamesToUpdate.push({
          _id: game._id,
          lastNewsCheck: updateNow,
          lastNewsTimestamp: game.lastNewsTimestamp,
          nextNewsCheckAt: new Date(updateNow.getTime() + cooldownMs),
        });

        stats.gamesChecked++;

        if (stats.apiCalls < CONFIG.MAX_STEAM_NEWS_CALLS_PER_RUN) {
          await sleep(CONFIG.PAUSE_BETWEEN_CALLS);
        }
      } catch (error) {
        // On différencie 3 cas :
        //   - 403/404 : jeu privé / NDA / retiré → attendu, warn + cooldown long
        //   - 429     : rate limit Steam → silencieux (debug), cooldown moyen
        //   - autres  : vraie panne (5xx, timeout, réseau) → error + retry court
        let retryDelay;
        if (error instanceof SteamApiError && error.isExpected) {
          retryDelay = CONFIG.UNAVAILABLE_RETRY_MS;
          logger.warn(
            {
              gameId: game.gameId,
              gameName: game.name,
              status: error.status,
            },
            'steam_game_unavailable'
          );
        } else if (error instanceof SteamApiError && error.isRateLimited) {
          retryDelay = CONFIG.RATE_LIMIT_RETRY_MS;
          logger.debug(
            {
              gameId: game.gameId,
              gameName: game.name,
              status: error.status,
            },
            'steam_rate_limited'
          );
        } else {
          retryDelay = CONFIG.ERROR_RETRY_MS;
          logger.error(
            {
              err: error,
              gameId: game.gameId,
              gameName: game.name,
              status: error instanceof SteamApiError ? error.status : null,
            },
            'news_rotation_game_failed'
          );
          stats.errors.push({
            gameId: game.gameId,
            gameName: game.name,
            error: error.message,
          });
        }

        const errorNow = new Date();
        gamesToUpdate.push({
          _id: game._id,
          lastNewsCheck: errorNow,
          lastNewsTimestamp: game.lastNewsTimestamp,
          nextNewsCheckAt: new Date(errorNow.getTime() + retryDelay),
        });

        stats.gamesChecked++;
      }
    }

    // Bulk write toutes les MAJ en un seul appel
    if (gamesToUpdate.length > 0) {
      try {
        const bulkOps = gamesToUpdate.map((g) => ({
          updateOne: {
            filter: { _id: g._id },
            update: {
              $set: {
                lastNewsCheck: g.lastNewsCheck,
                lastNewsTimestamp: g.lastNewsTimestamp,
                nextNewsCheckAt: g.nextNewsCheckAt,
              },
            },
          },
        }));

        await GameSubscription.bulkWrite(bulkOps);
      } catch (bulkError) {
        logger.error({ err: bulkError }, 'news_rotation_bulk_write_failed');
      }
    }

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        durationMs,
        gamesChecked: stats.gamesChecked,
        apiCalls: stats.apiCalls,
        tiers: stats.tiers,
        newNewsFound: stats.newNewsFound,
        notificationsSent: stats.notificationsSent,
        errorsCount: stats.errors.length,
      },
      'news_rotation_done'
    );

    if (stats.errors.length > 0) {
      logger.warn(
        { errors: stats.errors.slice(0, 20) },
        'news_rotation_errors_detail'
      );
    }

    return stats;
  } catch (error) {
    logger.error({ err: error }, 'news_rotation_fatal');
    throw error;
  } finally {
    isRotationRunning = false;
  }
}

// ── Notifications ────────────────────────────────────────────────────────────

/**
 * Envoie les notifications pour un jeu ayant une nouvelle news.
 * Extrait de la boucle principale pour lisibilité — même logique qu'avant.
 */
async function sendNotificationsForGame(game, newsItem, firstImageUrl, stats) {
  const subscribers = game.subscribers || [];
  const newsGid = String(newsItem.gid);

  // Filtrer les abonnés déjà NOTIFIÉS (push FCM réellement envoyé pour cette news).
  // On NE filtre volontairement PAS sur inFeedAt : ce champ est posé dès qu'une
  // surface (app mobile, plugin Steam Desktop, web feed) *affiche* la news, ce
  // qui n'équivaut pas à "l'utilisateur a été notifié". Le filtrer ici laissait
  // le poll 5 min du plugin "consommer" la news avant le cron (30 min) → le push
  // mobile n'était jamais envoyé. La dédup desktop/mobile est gérée en aval par
  // preferSteamWhenOpen (présence via heartbeat) dans notificationService.
  // inFeedAt conserve son seul rôle : le grisage "vu" du feed.
  const alreadyServed = await UserNewsState.find({
    steamId: { $in: subscribers },
    appId: String(game.gameId),
    newsId: newsGid,
    pushSentAt: { $ne: null },
  }).select('steamId').lean();

  const alreadyServedSet = new Set(alreadyServed.map((s) => s.steamId));

  // Suivi silencieux (bouton +) : exclure les subscribers qui ont coupé les
  // notifications pour CE jeu (followedGames.notifications === false). Les
  // entrées legacy sans le champ ne matchent pas → notifiées (rétrocompat).
  // Le fil d'actu n'est PAS affecté : un suivi silencieux reste un suivi.
  const mutedUsers = await User.find({
    steamId: { $in: subscribers },
    followedGames: {
      $elemMatch: { appId: String(game.gameId), notifications: false },
    },
  })
    .select('steamId')
    .lean();
  const mutedSet = new Set(mutedUsers.map((u) => u.steamId));

  const eligibleSubscribers = subscribers.filter(
    (sid) => !alreadyServedSet.has(sid) && !mutedSet.has(sid)
  );

  logger.debug(
    {
      gameId: game.gameId,
      eligible: eligibleSubscribers.length,
      total: subscribers.length,
      alreadyServed: alreadyServedSet.size,
      muted: mutedSet.size,
    },
    'news_notification_subscribers_filtered'
  );

  const MS_IN_DAY = 24 * 60 * 60 * 1000;
  const RETENTION_DAYS = 90;

  for (
    let i = 0;
    i < eligibleSubscribers.length;
    i += CONFIG.NOTIFICATION_BATCH_SIZE
  ) {
    const batch = eligibleSubscribers.slice(
      i,
      i + CONFIG.NOTIFICATION_BATCH_SIZE
    );
    const results = await Promise.allSettled(
      batch.map((steamId) =>
        notificationService.sendNewsNotification(
          steamId,
          game.gameId,
          game.name,
          newsItem.title,
          newsItem.url,
          newsItem.gid,
          firstImageUrl
        )
      )
    );

    const pushSentOps = [];
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled' && result.value === true) {
        stats.notificationsSent++;
        pushSentOps.push({
          updateOne: {
            filter: {
              steamId: batch[idx],
              appId: String(game.gameId),
              newsId: newsGid,
            },
            update: {
              $set: { pushSentAt: new Date() },
              $setOnInsert: {
                steamId: batch[idx],
                appId: String(game.gameId),
                newsId: newsGid,
                expiresAt: new Date(Date.now() + RETENTION_DAYS * MS_IN_DAY),
              },
            },
            upsert: true,
          },
        });
      } else if (result.status === 'rejected') {
        logger.error(
          { err: result.reason, steamId: batch[idx], gameId: game.gameId },
          'news_notification_send_rejected'
        );
      }
    });

    if (pushSentOps.length > 0) {
      await UserNewsState.bulkWrite(pushSentOps, { ordered: false }).catch(
        (err) => {
          logger.error(
            { err },
            'news_rotation_push_sent_bulk_failed'
          );
        }
      );
    }
  }
}

module.exports = {
  checkNewsRotation,
};
