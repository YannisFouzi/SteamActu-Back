/**
 * Service de synchronisation de la bibliothèque de jeux Steam
 * Cache complet de la bibliothèque avec détection de nouveaux jeux et auto-follow
 */

const User = require("../models/User");
const GameSubscription = require("../models/GameSubscription");
const steamService = require("./steamService");

/**
 * Synchronise la bibliothèque d'un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object>} Résultat de la synchronisation
 */
async function syncUserLibrary(steamId) {
  try {
    console.log(`🔄 Synchronisation bibliothèque pour ${steamId}`);

    // Récupérer l'utilisateur
    const user = await User.findOne({ steamId });
    if (!user) {
      console.log(`❌ Utilisateur ${steamId} non trouvé`);
      return { success: false, error: "Utilisateur non trouvé" };
    }

    // Récupérer la bibliothèque depuis Steam
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

    // Si la bibliothèque est vide, pas de traitement
    if (!Array.isArray(steamGames) || steamGames.length === 0) {
      console.log(`ℹ️ Bibliothèque vide pour ${steamId}`);
      return { success: true, newGames: 0, autoFollowed: 0 };
    }

    // Créer un Set des appIds existants dans le cache
    const cachedAppIds = new Set(
      (user.gameLibrary?.games || []).map((g) => g.appId)
    );

    // Détecter les nouveaux jeux
    const newGames = [];
    const updatedGames = [];

    for (const steamGame of steamGames) {
      const appId = steamGame.appid.toString();

      if (!cachedAppIds.has(appId)) {
        // Nouveau jeu détecté
        newGames.push({
          appId: appId,
          name: steamGame.name,
          playtime_forever: steamGame.playtime_forever || 0,
          playtime_2weeks: steamGame.playtime_2weeks || 0,
          rtime_last_played: steamGame.rtime_last_played || 0,
          img_icon_url: steamGame.img_icon_url || "",
          firstSeenDate: new Date(), // Date de détection
        });
      } else {
        // Jeu existant, mettre à jour les infos
        updatedGames.push({
          appId: appId,
          name: steamGame.name,
          playtime_forever: steamGame.playtime_forever || 0,
          playtime_2weeks: steamGame.playtime_2weeks || 0,
          rtime_last_played: steamGame.rtime_last_played || 0,
          img_icon_url: steamGame.img_icon_url || "",
          // Garder le firstSeenDate existant
        });
      }
    }

    console.log(`✨ ${newGames.length} nouveau(x) jeu(x) détecté(s)`);

    // Auto-follow si activé (OPTIMISÉ avec bulkWrite)
    let autoFollowedCount = 0;
    if (
      newGames.length > 0 &&
      user.notificationSettings?.autoFollowNewGames === true
    ) {
      console.log(`🎯 Auto-follow activé, ajout des nouveaux jeux...`);

      // Filtrer les jeux pas encore suivis
      const gamesToFollow = newGames.filter(
        (game) => !user.followedGames.includes(game.appId)
      );

      if (gamesToFollow.length > 0) {
        try {
          // Ajouter tous les appIds en une fois
          user.followedGames.push(...gamesToFollow.map((g) => g.appId));
          autoFollowedCount = gamesToFollow.length;

          // Bulk write pour GameSubscriptions (1 seul appel DB)
          const bulkOps = gamesToFollow.map((game) => ({
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

    // Reconstruire la bibliothèque complète (OPTIMISÉ avec Map O(n))
    const existingGamesMap = new Map(
      (user.gameLibrary?.games || []).map((g) => [g.appId, g])
    );

    const completeLibrary = [
      ...newGames,
      ...updatedGames.map((game) => ({
        ...game,
        firstSeenDate:
          existingGamesMap.get(game.appId)?.firstSeenDate || new Date(),
      })),
    ];

    // Détecter les jeux supprimés de la bibliothèque Steam
    const steamAppIds = new Set(steamGames.map((g) => g.appid.toString()));
    const removedGames = (user.gameLibrary?.games || []).filter(
      (cachedGame) => !steamAppIds.has(cachedGame.appId)
    );

    if (removedGames.length > 0) {
      console.log(
        `🗑️ ${removedGames.length} jeu(x) supprimé(s) de la bibliothèque Steam`
      );
      // Retirer également de followedGames
      user.followedGames = user.followedGames.filter((appId) =>
        steamAppIds.has(appId)
      );
    }

    // Mettre à jour le cache de l'utilisateur
    user.gameLibrary = {
      games: completeLibrary,
      lastFullSync: new Date(),
      gamesCount: completeLibrary.length,
    };

    // Monitoring taille du document (avertissement si > 10MB)
    const docSize = JSON.stringify(user.toObject()).length;
    const docSizeMB = (docSize / (1024 * 1024)).toFixed(2);
    console.log(`📏 Taille du document User : ${docSizeMB} MB`);

    if (docSize > 10 * 1024 * 1024) {
      console.warn(
        `⚠️ ALERTE : Document User proche de la limite MongoDB (${docSizeMB} MB / 16 MB)`
      );
    }

    // Sauvegarder l'utilisateur
    await user.save();

    console.log(`✅ Synchronisation bibliothèque terminée pour ${steamId}`);
    console.log(`📊 Total jeux en cache : ${completeLibrary.length}`);

    return {
      success: true,
      newGames: newGames.length,
      autoFollowed: autoFollowedCount,
      totalGames: completeLibrary.length,
      newGamesDetails: newGames.map((g) => ({
        appId: g.appId,
        name: g.name,
      })),
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
 * @returns {Promise<Object>} Statistiques de la synchronisation
 */
async function syncAllUsersLibraries() {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 DÉBUT SYNCHRONISATION GLOBALE BIBLIOTHÈQUES");
    console.log("=".repeat(60));

    const startTime = Date.now();

    // Récupérer tous les utilisateurs
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

    // Synchroniser chaque utilisateur avec pause entre les appels
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

      // Pause de 1 seconde entre chaque utilisateur pour respecter les limites API
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
