const User = require("../models/User");
const GameSubscription = require("../models/GameSubscription");
const steamService = require("../services/steamService");
const notificationService = require("../services/notificationService");

/**
 * NOUVEAU newsChecker ULTRA-OPTIMISÉ
 * Utilise GameSubscription pour minimiser les requêtes API Steam
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function checkNewsForAllUsers() {
  try {
    console.log("🚀 Démarrage de la vérification optimisée des actualités...");

    // ÉTAPE 1 : Récupérer tous les jeux suivis (source de vérité)
    const gameSubscriptions = await GameSubscription.find({});

    if (gameSubscriptions.length === 0) {
      console.log("📭 Aucun jeu suivi, aucune vérification nécessaire");
      return 0;
    }

    console.log(`🎯 ${gameSubscriptions.length} jeux uniques à vérifier`);

    let totalNotifications = 0;
    let processedGames = 0;
    let totalSubscribers = 0;

    // Calculer le nombre total d'abonnements
    gameSubscriptions.forEach((game) => {
      totalSubscribers += game.subscribers.length;
    });

    console.log(`👥 ${totalSubscribers} abonnements au total`);

    // ÉTAPE 2 : Vérifier les actualités pour chaque jeu (1 requête API par jeu)
    for (const gameSubscription of gameSubscriptions) {
      try {
        processedGames++;
        const { gameId, name, subscribers, lastNewsTimestamp } =
          gameSubscription;

        console.log(
          `[${processedGames}/${gameSubscriptions.length}] 🔍 ${name} (${subscribers.length} abonnés)`
        );

        // Récupérer les actualités du jeu (UNE SEULE FOIS pour tous les abonnés)
        const news = await steamService.getGameNews(gameId, 5);

        if (!news || news.length === 0) {
          console.log(`  ⚪ Aucune actualité trouvée`);
          continue;
        }

        // Filtrer les nouvelles actualités (depuis le dernier check)
        const newNews = news.filter((item) => item.date > lastNewsTimestamp);

        if (newNews.length === 0) {
          console.log(`  ⚪ Aucune nouvelle actualité`);
          continue;
        }

        console.log(
          `  🆕 ${newNews.length} nouvelle(s) actualité(s) trouvée(s)`
        );

        // Mettre à jour le timestamp de la dernière actualité
        const latestNewsTimestamp = Math.max(
          ...newNews.map((item) => item.date)
        );
        gameSubscription.lastNewsTimestamp = latestNewsTimestamp;
        await gameSubscription.save();

        // ÉTAPE 3 : Distribuer les notifications à tous les abonnés
        let gameNotifications = 0;

        for (const steamId of subscribers) {
          try {
            // Récupérer l'utilisateur pour vérifier ses paramètres de notification
            const user = await User.findOne({
              steamId,
              "notificationSettings.enabled": true,
              "notificationSettings.pushToken": { $exists: true, $ne: null },
            });

            if (!user) {
              console.log(
                `  ⚠️  Utilisateur ${steamId} non trouvé ou notifications désactivées`
              );
              continue;
            }

            // Envoyer les notifications à cet utilisateur
            const notificationCount =
              await notificationService.sendNewsNotifications(user, {
                [gameId]: newNews,
              });

            gameNotifications += notificationCount;
            totalNotifications += notificationCount;

            // Mettre à jour lastChecked pour l'utilisateur
            user.lastChecked = new Date();
            await user.save();
          } catch (userError) {
            console.error(
              `  ❌ Erreur pour l'utilisateur ${steamId}:`,
              userError.message
            );
          }
        }

        if (gameNotifications > 0) {
          console.log(`  ✅ ${gameNotifications} notification(s) envoyée(s)`);
        }
      } catch (gameError) {
        console.error(
          `❌ Erreur pour le jeu ${gameSubscription.gameId}:`,
          gameError.message
        );
      }
    }

    // ÉTAPE 4 : Statistiques finales
    console.log("📊 Statistiques de la vérification :");
    console.log(`   • ${processedGames} jeux vérifiés`);
    console.log(`   • ${totalSubscribers} abonnements traités`);
    console.log(`   • ${totalNotifications} notifications envoyées`);
    console.log(
      `   • Économie : ${processedGames} requêtes API au lieu de ${totalSubscribers}`
    );
    console.log(
      `   • Gain : ${Math.round(
        (1 - processedGames / totalSubscribers) * 100
      )}% de requêtes économisées`
    );

    console.log("🎉 Vérification terminée avec succès !");
    return totalNotifications;
  } catch (error) {
    console.error("💥 Erreur lors de la vérification des actualités:", error);
    return 0;
  }
}

/**
 * Vérifier les actualités pour un utilisateur spécifique (fonction de compatibilité)
 * @param {Object} user - Utilisateur pour lequel vérifier les actualités
 * @returns {Promise<number>} - Nombre de notifications envoyées
 */
async function checkNewsForUser(user) {
  try {
    if (!user.followedGames || user.followedGames.length === 0) {
      return 0;
    }

    console.log(`🔍 Vérification individuelle pour ${user.username}`);

    let totalNotifications = 0;

    // Pour chaque jeu suivi par cet utilisateur
    for (const gameId of user.followedGames) {
      try {
        // Trouver la GameSubscription correspondante
        const gameSubscription = await GameSubscription.findOne({ gameId });

        if (!gameSubscription) {
          console.log(`⚠️  GameSubscription non trouvée pour ${gameId}`);
          continue;
        }

        // Récupérer les actualités
        const news = await steamService.getGameNews(gameId, 5);

        if (!news || news.length === 0) continue;

        // Filtrer les nouvelles actualités
        const newNews = news.filter(
          (item) => item.date > gameSubscription.lastNewsTimestamp
        );

        if (newNews.length === 0) continue;

        // Envoyer notifications
        const notificationCount =
          await notificationService.sendNewsNotifications(user, {
            [gameId]: newNews,
          });

        totalNotifications += notificationCount;

        // Mettre à jour le timestamp
        gameSubscription.lastNewsTimestamp = Math.max(
          ...newNews.map((item) => item.date)
        );
        await gameSubscription.save();
      } catch (error) {
        console.error(`Erreur pour le jeu ${gameId}:`, error.message);
      }
    }

    if (totalNotifications > 0) {
      user.lastChecked = new Date();
      await user.save();
    }

    return totalNotifications;
  } catch (error) {
    console.error(
      `Erreur lors de la vérification pour ${user.steamId}:`,
      error
    );
    return 0;
  }
}

/**
 * Fonction utilitaire pour nettoyer les GameSubscriptions orphelines
 * (jeux sans abonnés)
 */
async function cleanupOrphanedSubscriptions() {
  try {
    console.log("🧹 Nettoyage des subscriptions orphelines...");

    const result = await GameSubscription.deleteMany({
      $or: [{ subscribers: { $size: 0 } }, { subscribers: { $exists: false } }],
    });

    if (result.deletedCount > 0) {
      console.log(
        `🗑️  ${result.deletedCount} subscription(s) orpheline(s) supprimée(s)`
      );
    } else {
      console.log("✅ Aucune subscription orpheline trouvée");
    }

    return result.deletedCount;
  } catch (error) {
    console.error("❌ Erreur lors du nettoyage:", error);
    return 0;
  }
}

module.exports = {
  checkNewsForAllUsers,
  checkNewsForUser,
  cleanupOrphanedSubscriptions,
};
