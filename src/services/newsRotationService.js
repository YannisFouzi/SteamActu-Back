/**
 * Service de rotation intelligente des vérifications d'actualités
 * Évite la surcharge API Steam en limitant les appels et en effectuant une rotation équitable
 */

const GameSubscription = require('../models/GameSubscription');
const steamService = require('./steamService');
const notificationService = require('./notifications/notificationService');

// Configuration
const CONFIG = {
  MAX_GAMES_TO_CHECK: 200, // Limite de jeux à vérifier par exécution
  MAX_API_CALLS: 150, // Limite stricte d'appels API Steam
  PAUSE_BETWEEN_CALLS: 100, // Pause en ms entre chaque appel
  NEWS_COUNT_PER_GAME: 3, // Nombre d'actualités à récupérer par jeu
  NOTIFICATION_BATCH_SIZE: 50, // Taille des batches pour notifications parallèles
};

// Lock global pour éviter double exécution
let isRotationRunning = false;

/**
 * Pause asynchrone
 * @param {number} ms - Durée en millisecondes
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Vérifie les actualités avec rotation intelligente
 * @returns {Promise<Object>} Statistiques de l'exécution
 */
async function checkNewsRotation() {
  // Vérifier le lock (éviter double exécution)
  if (isRotationRunning) {
    console.log('⚠️ Rotation déjà en cours, skip...');
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
    console.log('📰 DÉBUT VÉRIFICATION ACTUALITÉS (ROTATION)');
    console.log('='.repeat(60));

    const startTime = Date.now();

    // Récupérer les jeux à vérifier (rotation par lastNewsCheck)
    // Les jeux jamais vérifiés (lastNewsCheck: null) sont prioritaires
    const games = await GameSubscription.find()
      .sort({ lastNewsCheck: 1 }) // Plus anciens d'abord (null en premier)
      .limit(CONFIG.MAX_GAMES_TO_CHECK);

    console.log(`🎮 ${games.length} jeu(x) à vérifier`);

    if (games.length === 0) {
      console.log('ℹ️ Aucun jeu à vérifier');
      return {
        gamesChecked: 0,
        apiCalls: 0,
        newNewsFound: 0,
        notificationsSent: 0,
      };
    }

    const stats = {
      gamesChecked: 0,
      apiCalls: 0,
      newNewsFound: 0,
      notificationsSent: 0,
      errors: [],
    };

    // Tableau pour collecter les mises à jour (bulkWrite à la fin)
    const gamesToUpdate = [];

    // Vérifier chaque jeu
    for (const game of games) {
      // Vérifier la limite d'appels API
      if (stats.apiCalls >= CONFIG.MAX_API_CALLS) {
        console.log(
          `⚠️ Limite d'appels API atteinte (${CONFIG.MAX_API_CALLS}), arrêt de la rotation`
        );
        break;
      }

      try {
        console.log(
          `\n[${stats.gamesChecked + 1}/${games.length}] Vérification : ${
            game.name
          } (${game.gameId})`
        );

        // Récupérer les actualités depuis Steam
        const news = await steamService.getGameNews(
          game.gameId,
          CONFIG.NEWS_COUNT_PER_GAME
        );
        stats.apiCalls++;

        // Vérifier s'il y a de nouvelles actualités
        if (news && news.length > 0) {
          const latestNewsTimestamp = news[0].date || 0;
          const currentTimestamp = game.lastNewsTimestamp || 0;

          console.log(
            `📅 Dernier timestamp connu : ${currentTimestamp} | Dernier timestamp actuel : ${latestNewsTimestamp}`
          );

          // Si nouvelles actualités détectées
          if (latestNewsTimestamp > currentTimestamp) {
            console.log(`✨ Nouvelles actualités détectées pour ${game.name}!`);
            stats.newNewsFound++;

            // Envoyer des notifications aux abonnés (PARALLÉLISÉ par batch)
            const subscribers = game.subscribers || [];
            console.log(
              `📬 Envoi de notifications à ${subscribers.length} abonné(s)`
            );

            // Envoyer par batches pour éviter surcharge
            for (
              let i = 0;
              i < subscribers.length;
              i += CONFIG.NOTIFICATION_BATCH_SIZE
            ) {
              const batch = subscribers.slice(
                i,
                i + CONFIG.NOTIFICATION_BATCH_SIZE
              );
              const results = await Promise.allSettled(
                batch.map((steamId) =>
                  notificationService.sendNewsNotification(
                    steamId,
                    game.gameId,
                    game.name,
                    news[0].title
                  )
                )
              );

              // Compter les succès
              results.forEach((result) => {
                if (result.status === 'fulfilled') {
                  stats.notificationsSent++;
                } else {
                  console.error(
                    `❌ Erreur envoi notification:`,
                    result.reason?.message
                  );
                }
              });
            }

            // Mettre à jour le timestamp
            game.lastNewsTimestamp = latestNewsTimestamp;
            console.log(`✅ Timestamp mis à jour : ${latestNewsTimestamp}`);
          } else {
            console.log(`ℹ️ Pas de nouvelles actualités`);
          }
        } else {
          console.log(`ℹ️ Aucune actualité disponible`);
        }

        // Collecter les mises à jour (sauvegarde en bulk plus tard)
        game.lastNewsCheck = new Date();
        gamesToUpdate.push({
          _id: game._id,
          lastNewsCheck: game.lastNewsCheck,
          lastNewsTimestamp: game.lastNewsTimestamp,
        });

        stats.gamesChecked++;

        // Pause entre les appels pour respecter les limites API
        if (stats.apiCalls < CONFIG.MAX_API_CALLS) {
          await sleep(CONFIG.PAUSE_BETWEEN_CALLS);
        }
      } catch (error) {
        console.error(
          `❌ Erreur lors de la vérification de ${game.name}:`,
          error.message
        );
        stats.errors.push({
          gameId: game.gameId,
          gameName: game.name,
          error: error.message,
        });

        // Collecter même en cas d'erreur pour ne pas bloquer
        game.lastNewsCheck = new Date();
        gamesToUpdate.push({
          _id: game._id,
          lastNewsCheck: game.lastNewsCheck,
          lastNewsTimestamp: game.lastNewsTimestamp,
        });

        stats.gamesChecked++;
      }
    }

    // Sauvegarder toutes les mises à jour en BULK (1 seul appel DB)
    if (gamesToUpdate.length > 0) {
      try {
        const bulkOps = gamesToUpdate.map((game) => ({
          updateOne: {
            filter: { _id: game._id },
            update: {
              $set: {
                lastNewsCheck: game.lastNewsCheck,
                lastNewsTimestamp: game.lastNewsTimestamp,
              },
            },
          },
        }));

        await GameSubscription.bulkWrite(bulkOps);
        console.log(
          `💾 ${gamesToUpdate.length} jeu(x) mis à jour en bulk dans MongoDB`
        );
      } catch (bulkError) {
        console.error(`❌ Erreur bulkWrite:`, bulkError.message);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('📊 RÉSUMÉ VÉRIFICATION ACTUALITÉS');
    console.log('='.repeat(60));
    console.log(`⏱️  Durée : ${duration}s`);
    console.log(`🎮 Jeux vérifiés : ${stats.gamesChecked}`);
    console.log(`🔌 Appels API Steam : ${stats.apiCalls}`);
    console.log(`✨ Nouvelles actualités trouvées : ${stats.newNewsFound}`);
    console.log(`📬 Notifications envoyées : ${stats.notificationsSent}`);
    console.log(`❌ Erreurs : ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\n❌ Erreurs détaillées :');
      stats.errors.forEach((err) => {
        console.log(`  - ${err.gameName} (${err.gameId}): ${err.error}`);
      });
    }

    console.log('='.repeat(60) + '\n');

    return stats;
  } catch (error) {
    console.error(
      '❌ Erreur globale lors de la vérification des actualités:',
      error
    );
    throw error;
  } finally {
    // Libérer le lock dans tous les cas
    isRotationRunning = false;
  }
}

/**
 * Obtient des statistiques sur l'état de la rotation
 * @returns {Promise<Object>} Statistiques de rotation
 */
async function getRotationStats() {
  try {
    const totalGames = await GameSubscription.countDocuments();
    const neverChecked = await GameSubscription.countDocuments({
      lastNewsCheck: null,
    });

    // Trouver le plus ancien check
    const oldestCheck = await GameSubscription.findOne({
      lastNewsCheck: { $ne: null },
    }).sort({ lastNewsCheck: 1 });

    // Trouver le plus récent check
    const newestCheck = await GameSubscription.findOne({
      lastNewsCheck: { $ne: null },
    }).sort({ lastNewsCheck: -1 });

    return {
      totalGames,
      neverChecked,
      checked: totalGames - neverChecked,
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
  CONFIG, // Exporter la config pour tests/debug
};
