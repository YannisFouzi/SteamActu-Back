/**
 * Service de synchronisation de la wishlist Steam
 * Détecte les nouveaux jeux ajoutés à la wishlist et auto-follow si activé
 */

const User = require("../models/User");
const GameSubscription = require("../models/GameSubscription");
const steamService = require("./steamService");

/**
 * Synchronise la wishlist d'un utilisateur
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object>} Résultat de la synchronisation
 */
async function syncUserWishlist(steamId) {
  try {
    console.log(`🔄 Synchronisation wishlist pour ${steamId}`);

    // Récupérer l'utilisateur
    const user = await User.findOne({ steamId });
    if (!user) {
      console.log(`❌ Utilisateur ${steamId} non trouvé`);
      return { success: false, error: "Utilisateur non trouvé" };
    }

    // Récupérer la wishlist depuis Steam
    let wishlistItems = [];
    try {
      wishlistItems = await steamService.getUserWishlist(steamId);
      console.log(`📋 Wishlist récupérée : ${wishlistItems.length} jeux`);
    } catch (error) {
      console.error(
        `❌ Erreur lors de la récupération de la wishlist pour ${steamId}:`,
        error.message
      );
      return { success: false, error: error.message };
    }

    // Si la wishlist est vide, pas de traitement
    if (!Array.isArray(wishlistItems) || wishlistItems.length === 0) {
      console.log(`ℹ️ Wishlist vide pour ${steamId}`);
      user.wishlistLastSync.lastSyncDate = new Date();
      await user.save();
      return { success: true, newGames: 0, autoFollowed: 0 };
    }

    // Trier par date d'ajout décroissante (plus récents d'abord)
    const sortedWishlist = wishlistItems.sort(
      (a, b) => (b.date_added || 0) - (a.date_added || 0)
    );

    // Récupérer le dernier timestamp connu
    const lastKnownTimestamp = user.wishlistLastSync?.timestamp || 0;
    console.log(
      `📅 Dernier timestamp connu : ${lastKnownTimestamp} (${new Date(
        lastKnownTimestamp * 1000
      ).toLocaleString()})`
    );

    // Détecter les nouveaux jeux ajoutés depuis la dernière sync
    const newGames = [];
    for (const item of sortedWishlist) {
      const dateAdded = item.date_added || 0;

      // Si on atteint un jeu plus ancien que le dernier check, on arrête
      if (dateAdded <= lastKnownTimestamp) {
        break;
      }

      newGames.push({
        appId: item.appid.toString(),
        dateAdded: dateAdded,
        dateAddedReadable: new Date(dateAdded * 1000).toLocaleString(),
      });
    }

    console.log(
      `✨ ${newGames.length} nouveau(x) jeu(x) détecté(s) dans la wishlist`
    );

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
                  name: `Game ${game.appId}`,
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

    // Mettre à jour le timestamp avec le jeu le plus récent
    if (sortedWishlist.length > 0) {
      const latestTimestamp = sortedWishlist[0].date_added || 0;
      user.wishlistLastSync.timestamp = latestTimestamp;
    }

    user.wishlistLastSync.lastSyncDate = new Date();

    // Sauvegarder l'utilisateur
    await user.save();

    console.log(`✅ Synchronisation wishlist terminée pour ${steamId}`);

    return {
      success: true,
      newGames: newGames.length,
      autoFollowed: autoFollowedCount,
      totalWishlistGames: wishlistItems.length,
      newGamesDetails: newGames,
    };
  } catch (error) {
    console.error(
      `❌ Erreur lors de la synchronisation wishlist pour ${steamId}:`,
      error
    );
    return { success: false, error: error.message };
  }
}

/**
 * Synchronise la wishlist de tous les utilisateurs
 * @returns {Promise<Object>} Statistiques de la synchronisation
 */
async function syncAllUsersWishlists() {
  try {
    console.log("\n" + "=".repeat(60));
    console.log("🚀 DÉBUT SYNCHRONISATION GLOBALE WISHLISTS");
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

      const result = await syncUserWishlist(user.steamId);

      if (result.success) {
        stats.successCount++;
        stats.totalNewGames += result.newGames || 0;
        stats.totalAutoFollowed += result.autoFollowed || 0;
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
    console.log("📊 RÉSUMÉ SYNCHRONISATION WISHLISTS");
    console.log("=".repeat(60));
    console.log(`⏱️  Durée : ${duration}s`);
    console.log(`✅ Succès : ${stats.successCount}`);
    console.log(`❌ Erreurs : ${stats.errorCount}`);
    console.log(`🆕 Nouveaux jeux détectés : ${stats.totalNewGames}`);
    console.log(`🎯 Jeux auto-suivis : ${stats.totalAutoFollowed}`);

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
      "❌ Erreur globale lors de la synchronisation des wishlists:",
      error
    );
    throw error;
  }
}

module.exports = {
  syncUserWishlist,
  syncAllUsersWishlists,
};
