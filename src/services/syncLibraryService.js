/**
 * Service de synchronisation de la bibliothèque de jeux Steam
 *
 * ⚠️ MODIFICATION ISSUE DE L'AUDIT 2025-11-04
 * - gameLibrary.games[] → gameLibrary.gameIds[] (normalisation)
 * - Jeux stockés dans collection Games séparée
 * - Suppression de gamesCount (redondant avec gameIds.length)
 * - Détection des jeux supprimés déplacée vers gameSync/userProcessor
 * Voir: AUDIT_REPORT.md section 3.7 et ACTIONS.md section 1.3
 *
 * ⚠️ CE SERVICE EST MAINTENANT REDONDANT AVEC gamesSyncService
 * Son cron a été désactivé (voir src/config/cron/index.js)
 * Conservé uniquement pour référence historique
 */

const User = require("../models/User");
const Game = require("../models/Game");
const GameSubscription = require("../models/GameSubscription");
const steamService = require("./steamService");

/**
 * Synchronise la bibliothèque d'un utilisateur avec la nouvelle structure normalisée
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object>} Résultat de la synchronisation
 */
async function syncUserLibrary(steamId) {
  try {
    console.log(`🔄 Synchronisation bibliothèque pour ${steamId}`);

    const user = await User.findOne({ steamId });
    if (!user) {
      console.log(`❌ Utilisateur ${steamId} non trouvé`);
      return { success: false, error: "Utilisateur non trouvé" };
    }

    let steamGames = [];
    try {
      steamGames = await steamService.getUserGames(steamId);
      console.log(`📚 Bibliothèque récupérée : ${steamGames.length} jeux`);
    } catch (error) {
      console.error(
        `❌ Erreur lors de la récupération de la bibliothèque pour ${steamId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }

    if (!Array.isArray(steamGames) || steamGames.length === 0) {
      console.log(`ℹ️ Bibliothèque vide pour ${steamId}`);
      return { success: true, newGames: 0, autoFollowed: 0 };
    }

    const cachedGameIds = new Set(user.gameLibrary?.gameIds || []);

    const newGames = [];
    const gamesToUpsert = [];

    for (const steamGame of steamGames) {
      const appId = steamGame.appid.toString();

      if (!cachedGameIds.has(appId)) {
        newGames.push(appId);
      }

      gamesToUpsert.push({
        updateOne: {
          filter: { appId: appId },
          update: {
            $set: {
              name: steamGame.name || "Unknown Game",
              img_icon_url: steamGame.img_icon_url || "",
              playtime_forever: steamGame.playtime_forever || 0,
              playtime_2weeks: steamGame.playtime_2weeks || 0,
              rtime_last_played: steamGame.rtime_last_played || 0,
              metadataLastSync: new Date(),
            },
            $setOnInsert: {
              appId: appId,
              firstSeenDate: new Date(),
            },
          },
          upsert: true,
        },
      });
    }

    console.log(`✨ ${newGames.length} nouveau(x) jeu(x) détecté(s)`);

    if (gamesToUpsert.length > 0) {
      await Game.bulkWrite(gamesToUpsert);
      console.log(`✅ ${gamesToUpsert.length} jeux créés/mis à jour en bulk`);
    }

    let autoFollowedCount = 0;
    if (
      newGames.length > 0 &&
      user.notificationSettings?.autoFollowNewGames === true
    ) {
      console.log(`🎯 Auto-follow activé, ajout des nouveaux jeux...`);

      const gamesToFollow = newGames.filter(
        (appId) => !user.followedGames.includes(appId)
      );

      if (gamesToFollow.length > 0) {
        try {
          user.followedGames.push(...gamesToFollow);
          autoFollowedCount = gamesToFollow.length;

          const games = await Game.find({ appId: { $in: gamesToFollow } });
          const bulkOps = games.map((game) => ({
            updateOne: {
              filter: { gameId: game.appId },
              update: {
                $setOnInsert: {
                  gameId: game.appId,
                  name: game.name,
                  lastNewsTimestamp: 0,
                },
                $addToSet: { subscribers: steamId },
              },
              upsert: true,
            },
          }));

          await GameSubscription.bulkWrite(bulkOps);
          console.log(`✅ ${autoFollowedCount} jeu(x) auto-suivi(s) en bulk`);
        } catch (error) {
          console.error(`❌ Erreur auto-follow bulk:`, error.message);
        }
      }
    }

    const allGameIds = steamGames.map((g) => g.appid.toString());

    user.gameLibrary = {
      gameIds: allGameIds,
      lastFullSync: new Date(),
    };

    await user.save();

    console.log(`✅ Synchronisation bibliothèque terminée pour ${steamId}`);
    console.log(`📊 Total jeux en cache : ${allGameIds.length}`);

    return {
      success: true,
      newGames: newGames.length,
      autoFollowed: autoFollowedCount,
      totalGames: allGameIds.length,
    };
  } catch (error) {
    console.error(
      `❌ Erreur lors de la synchronisation bibliothèque pour ${steamId}:`,
      error
    );
    return { success: false, error: error.message };
  }
}

/**
 * Synchronise la bibliothèque de tous les utilisateurs
 * ⚠️ ATTENTION: Cette fonction est redondante avec gamesSyncService
 * Elle est conservée uniquement pour compatibilité temporaire
 * @returns {Promise<Object>} Statistiques de la synchronisation
 */
async function syncAllUsersLibraries() {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 DÉBUT SYNCHRONISATION GLOBALE BIBLIOTHÈQUES");
    console.log("⚠️  AVERTISSEMENT: Cette fonction est redondante");
    console.log("=".repeat(60));

    const startTime = Date.now();

    const users = await User.find({});
    console.log(`👥 ${users.length} utilisateur(s) à synchroniser`);

    const stats = {
      totalUsers: users.length,
      successCount: 0,
      errorCount: 0,
      totalNewGames: 0,
      totalAutoFollowed: 0,
      totalGames: 0,
      errors: [],
    };

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      console.log(
        `\n[${i + 1}/${users.length}] Traitement de ${user.steamId} (${
          user.username
        })`
      );

      const result = await syncUserLibrary(user.steamId);

      if (result.success) {
        stats.successCount++;
        stats.totalNewGames += result.newGames || 0;
        stats.totalAutoFollowed += result.autoFollowed || 0;
        stats.totalGames += result.totalGames || 0;
      } else {
        stats.errorCount++;
        stats.errors.push({
          steamId: user.steamId,
          error: result.error,
        });
      }

      if (i < users.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n" + "=".repeat(60));
    console.log("📊 RÉSUMÉ SYNCHRONISATION BIBLIOTHÈQUES");
    console.log("=".repeat(60));
    console.log(`⏱️  Durée : ${duration}s`);
    console.log(`✅ Succès : ${stats.successCount}`);
    console.log(`❌ Erreurs : ${stats.errorCount}`);
    console.log(`🆕 Nouveaux jeux détectés : ${stats.totalNewGames}`);
    console.log(`🎯 Jeux auto-suivis : ${stats.totalAutoFollowed}`);
    console.log(`📚 Total jeux en cache : ${stats.totalGames}`);

    if (stats.errors.length > 0) {
      console.log("\n❌ Erreurs détaillées :");
      stats.errors.forEach((err) => {
        console.log(`  - ${err.steamId}: ${err.error}`);
      });
    }

    console.log("=".repeat(60) + "\n");

    return stats;
  } catch (error) {
    console.error(
      "❌ Erreur globale lors de la synchronisation des bibliothèques:",
      error
    );
    throw error;
  }
}

module.exports = {
  syncUserLibrary,
  syncAllUsersLibraries,
};
