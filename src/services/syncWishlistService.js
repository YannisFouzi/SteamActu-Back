/**
 * Service de synchronisation de la wishlist Steam
 * VERSION NORMALISÉE (2025-11-04)
 *
 * PHILOSOPHIE :
 * - Même logique que Games : collection Wishlist partagée entre users
 * - Pas de doublon : un jeu wishlisted = 1 document, N users le référencent
 * - User.wishlist.gameIds[] contient les références vers Wishlist.appId
 *
 * MODIFICATIONS :
 * - Stockage dans collection Wishlist (métadonnées communes)
 * - User.wishlist.gameIds[] au lieu de wishlistLastSync
 * - Détection nouveaux jeux via comparaison gameIds
 */

const User = require("../models/User");
const Wishlist = require("../models/Wishlist");
const GameSubscription = require("../models/GameSubscription");
const steamService = require("./steamService");

/**
 * Crée/met à jour les documents Wishlist dans la collection
 * Logique identique à Games : upsert = INSERT si nouveau, UPDATE si existe
 * @param {Array} wishlistGames - Jeux wishlist bruts de l'API Steam
 * @returns {Promise<void>}
 */
async function upsertWishlistCollection(wishlistGames) {
  if (!wishlistGames || wishlistGames.length === 0) {
    return;
  }

  const startTime = Date.now();
  console.log(`[WISHLIST] upsertWishlistCollection() - START`);
  console.log(`  - Jeux à traiter: ${wishlistGames.length}`);

  // ✅ FIX TEMPORAIRE: Accepter tous les jeux, même avec noms "Game XXXXX"
  // L'enrichissement API Steam échoue souvent, donc on insère quand même
  const validGames = wishlistGames.filter((steamGame) => {
    return steamGame.name && steamGame.appid;
  });

  console.log(`  - Jeux valides: ${validGames.length}/${wishlistGames.length}`);

  if (validGames.length === 0) {
    console.log(`  ⚠️ Aucun jeu valide, skip bulkWrite`);
    return;
  }

  const bulkOps = validGames.map((steamGame) => ({
    updateOne: {
      filter: { appId: steamGame.appid.toString() },
      update: {
        $set: {
          name: steamGame.name,
          img_icon_url: steamGame.capsule || steamGame.header_image || steamGame.img_icon_url || "",
        },
        $setOnInsert: {
          appId: steamGame.appid.toString(),
        },
      },
      upsert: true,
    },
  }));

  await Wishlist.bulkWrite(bulkOps);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[WISHLIST] upsertWishlistCollection() - END`);
  console.log(`  - BulkWrite operations: ${bulkOps.length}`);
  console.log(`  - Jeux skipped: ${wishlistGames.length - validGames.length}`);
  console.log(`  - Durée: ${duration}s`);
}

/**
 * Synchronise la wishlist d'un utilisateur - VERSION NORMALISÉE
 * @param {string} steamId - ID Steam de l'utilisateur
 * @param {Array} wishlistData - Données wishlist déjà récupérées (optionnel)
 * @returns {Promise<Object>} Résultat de la synchronisation
 */
async function syncUserWishlist(steamId, wishlistData = null) {
  try {
    console.log(`\n[WISHLIST] Synchronisation pour ${steamId}`);

    const user = await User.findOne({ steamId });
    if (!user) {
      console.log(`❌ Utilisateur ${steamId} non trouvé`);
      return { success: false, error: "Utilisateur non trouvé" };
    }

    let wishlistItems = [];

    if (wishlistData && Array.isArray(wishlistData)) {
      console.log(`📦 Utilisation des données déjà récupérées : ${wishlistData.length} jeux`);
      wishlistItems = wishlistData;
    } else {
      try {
        wishlistItems = await steamService.getUserWishlist(steamId);
        console.log(`📋 Wishlist récupérée : ${wishlistItems.length} jeux`);
      } catch (error) {
        console.error(`❌ Erreur récupération wishlist:`, error.message);
        return { success: false, error: error.message };
      }
    }

    // Si la wishlist est vide
    if (!Array.isArray(wishlistItems) || wishlistItems.length === 0) {
      console.log(`ℹ️ Wishlist vide pour ${steamId}`);
      user.wishlist = { games: [], lastFullSync: new Date() };
      await user.save();
      return { success: true, newGames: 0, autoFollowed: 0 };
    }

    // Upsert dans collection Wishlist (pas de doublon entre users)
    await upsertWishlistCollection(wishlistItems);
    console.log(`✅ ${wishlistItems.length} jeux créés/mis à jour dans Wishlist`);

    // Récupérer gameIds actuels en BDD
    const cachedGameIds = new Set(
      (user.wishlist?.games || []).map((g) => g.gameId)
    );

    // Détecter nouveaux jeux (dans Steam mais pas en BDD)
    const newGames = [];
    for (const game of wishlistItems) {
      const appId = game.appid.toString();
      if (!cachedGameIds.has(appId)) {
        newGames.push({
          appId,
          name: game.name,
        });
      }
    }

    console.log(`✨ ${newGames.length} nouveau(x) jeu(x) détecté(s)`);

    // Auto-follow si activé
    let autoFollowedCount = 0;
    if (
      newGames.length > 0 &&
      user.notificationSettings?.autoFollowNewGames === true
    ) {
      console.log(`🎯 Auto-follow activé...`);

      // Filtrer les jeux pas encore suivis
      const gamesToFollow = newGames.filter(
        (game) => !user.followedGames.includes(game.appId)
      );

      if (gamesToFollow.length > 0) {
        try {
          // Ajouter à followedGames
          user.followedGames.push(...gamesToFollow.map((g) => g.appId));
          autoFollowedCount = gamesToFollow.length;

          // Bulk write GameSubscriptions
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
          console.log(`✅ ${autoFollowedCount} jeu(x) auto-suivi(s)`);
        } catch (error) {
          console.error(`❌ Erreur auto-follow:`, error.message);
        }
      }
    }

    // Mettre à jour User.wishlist avec games[] (date_added user-specific)
    user.wishlist = {
      games: wishlistItems.map((item) => ({
        gameId: item.appid.toString(),
        date_added: item.date_added || 0,
        priority: item.priority || 0,
      })),
      lastFullSync: new Date(),
    };

    await user.save();

    console.log(`✅ Wishlist mise à jour: ${wishlistItems.length} jeux\n`);

    return {
      success: true,
      newGames: newGames.length,
      autoFollowed: autoFollowedCount,
      totalWishlistGames: wishlistItems.length,
      newGamesDetails: newGames,
    };
  } catch (error) {
    console.error(`❌ Erreur sync wishlist pour ${steamId}:`, error);
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
