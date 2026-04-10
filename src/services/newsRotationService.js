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
const UserNewsState = require('../models/UserNewsState');
const steamService = require('./steamService');
const notificationService = require('./notifications/notificationService');
const { extractFirstImage } = require('./newsFeed/imageExtractor');

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
  COOLDOWN_HOT_MS:   1 * 60 * 60 * 1000,   //  1 h
  COOLDOWN_WARM_MS:  6 * 60 * 60 * 1000,   //  6 h
  COOLDOWN_COLD_MS: 24 * 60 * 60 * 1000,   // 24 h

  // Retry sur erreur Steam (timeout, 5xx, rate-limit)
  ERROR_RETRY_MS: 15 * 60 * 1000,          // 15 min
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
    console.log('[WARN] Rotation déjà en cours, skip...');
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
    console.log('\n' + '='.repeat(60));
    console.log('[NEWS] DÉBUT VÉRIFICATION ACTUALITÉS (ROTATION ADAPTATIVE)');
    console.log('='.repeat(60));

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

    console.log(`[GAMES] ${games.length} jeu(x) éligible(s) à vérifier`);

    if (games.length === 0) {
      console.log('[INFO] Aucun jeu éligible');
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
        console.log(
          `\n[${stats.gamesChecked + 1}/${games.length}] Vérification : ${
            game.name
          } (${game.gameId})`
        );

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

          console.log(
            `  timestamp connu: ${currentTimestamp} | steam: ${latestNewsTimestamp}`
          );

          if (latestNewsTimestamp > currentTimestamp) {
            game.lastNewsTimestamp = latestNewsTimestamp;

            const firstImageUrl = extractFirstImage(news[0].contents);
            console.log(`[NEW] Nouvelles actualités détectées pour ${game.name}!`);
            stats.newNewsFound++;

            // Notifications aux abonnés éligibles
            await sendNotificationsForGame(game, news[0], firstImageUrl, stats);

            console.log(`[OK] Timestamp mis à jour : ${latestNewsTimestamp}`);
          } else {
            console.log(`[INFO] Pas de nouvelles actualités`);
          }
        } else {
          console.log(`[INFO] Aucune actualité disponible`);
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
        console.error(
          `[ERROR] Erreur lors de la vérification de ${game.name}:`,
          error.message
        );
        stats.errors.push({
          gameId: game.gameId,
          gameName: game.name,
          error: error.message,
        });

        // §3 : erreur Steam → retry dans 15 min, on avance lastNewsCheck
        const errorNow = new Date();
        gamesToUpdate.push({
          _id: game._id,
          lastNewsCheck: errorNow,
          lastNewsTimestamp: game.lastNewsTimestamp,
          nextNewsCheckAt: new Date(errorNow.getTime() + CONFIG.ERROR_RETRY_MS),
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
        console.log(
          `[INFO] ${gamesToUpdate.length} jeu(x) mis à jour en bulk`
        );
      } catch (bulkError) {
        console.error(`[ERROR] Erreur bulkWrite:`, bulkError.message);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('[INFO] RÉSUMÉ VÉRIFICATION ACTUALITÉS');
    console.log('='.repeat(60));
    console.log(`[TIMER] Durée : ${duration}s`);
    console.log(`[GAMES] Jeux vérifiés : ${stats.gamesChecked}`);
    console.log(`[SYNC] Appels API Steam : ${stats.apiCalls}`);
    console.log(`[TIER] hot=${stats.tiers.hot} warm=${stats.tiers.warm} cold=${stats.tiers.cold}`);
    console.log(`[NEW] Nouvelles actualités trouvées : ${stats.newNewsFound}`);
    console.log(`[INFO] Notifications envoyées : ${stats.notificationsSent}`);
    console.log(`[ERROR] Erreurs : ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n[ERROR] Erreurs détaillées :');
      stats.errors.forEach((err) => {
        console.log(`  - ${err.gameName} (${err.gameId}): ${err.error}`);
      });
    }

    console.log('='.repeat(60) + '\n');

    return stats;
  } catch (error) {
    console.error(
      '[ERROR] Erreur globale lors de la vérification des actualités:',
      error
    );
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

  // Filtrer les abonnés déjà servis (inFeedAt ou pushSentAt)
  const alreadyServed = await UserNewsState.find({
    steamId: { $in: subscribers },
    appId: String(game.gameId),
    newsId: newsGid,
    $or: [
      { inFeedAt: { $ne: null } },
      { pushSentAt: { $ne: null } },
    ],
  }).select('steamId').lean();

  const alreadyServedSet = new Set(alreadyServed.map((s) => s.steamId));
  const eligibleSubscribers = subscribers.filter(
    (sid) => !alreadyServedSet.has(sid)
  );

  console.log(
    `[INFO] ${eligibleSubscribers.length}/${subscribers.length} abonné(s) éligibles (${alreadyServedSet.size} déjà servi(s))`
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
      } else {
        console.error(
          `[ERROR] Erreur envoi notification:`,
          result.reason?.message
        );
      }
    });

    if (pushSentOps.length > 0) {
      await UserNewsState.bulkWrite(pushSentOps, { ordered: false }).catch((err) => {
        console.error('UserNewsState pushSentAt bulkWrite error:', err.message);
      });
    }
  }
}

// ── Stats ────────────────────────────────────────────────────────────────────

/**
 * Statistiques sur l'état de la rotation et la répartition par tier.
 */
async function getRotationStats() {
  try {
    const now = new Date();
    const totalGames = await GameSubscription.countDocuments();
    const neverChecked = await GameSubscription.countDocuments({
      lastNewsCheck: null,
    });
    const eligible = await GameSubscription.countDocuments({
      $or: [
        { nextNewsCheckAt: null },
        { nextNewsCheckAt: { $lte: now } },
      ],
    });

    const oldestCheck = await GameSubscription.findOne({
      lastNewsCheck: { $ne: null },
    }).sort({ lastNewsCheck: 1 });

    const newestCheck = await GameSubscription.findOne({
      lastNewsCheck: { $ne: null },
    }).sort({ lastNewsCheck: -1 });

    return {
      totalGames,
      neverChecked,
      checked: totalGames - neverChecked,
      eligible,
      oldestCheckDate: oldestCheck?.lastNewsCheck || null,
      newestCheckDate: newestCheck?.lastNewsCheck || null,
    };
  } catch (error) {
    console.error(
      'Erreur lors de la récupération des stats de rotation:',
      error
    );
    throw error;
  }
}

module.exports = {
  checkNewsRotation,
  getRotationStats,
  getTierCooldown,
  CONFIG,
};
