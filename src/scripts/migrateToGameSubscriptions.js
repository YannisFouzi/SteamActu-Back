const mongoose = require("mongoose");
const User = require("../models/User");
const GameSubscription = require("../models/GameSubscription");

/**
 * Script de migration des données existantes vers le nouveau système
 * Transforme user.followedGames en documents GameSubscription
 */
async function migrateToGameSubscriptions() {
  try {
    console.log("🚀 Démarrage de la migration vers GameSubscriptions...");

    // Vérifier si la migration a déjà été effectuée
    const existingSubscriptions = await GameSubscription.countDocuments();
    if (existingSubscriptions > 0) {
      console.log(
        `⚠️  ${existingSubscriptions} subscriptions déjà présentes. Migration déjà effectuée ?`
      );
      console.log(
        "Pour forcer la migration, supprimez d'abord la collection game_subscriptions"
      );
      return;
    }

    // Récupérer tous les utilisateurs avec des jeux suivis
    const users = await User.find({
      "followedGames.0": { $exists: true }, // Utilisateurs avec au moins 1 jeu suivi
    });

    console.log(`📊 ${users.length} utilisateurs avec des jeux suivis trouvés`);

    if (users.length === 0) {
      console.log("✅ Aucune donnée à migrer");
      return;
    }

    // Map pour regrouper les jeux par gameId
    const gamesMap = new Map();

    // Parcourir tous les utilisateurs et leurs jeux suivis
    users.forEach((user) => {
      if (user.followedGames && user.followedGames.length > 0) {
        user.followedGames.forEach((game) => {
          const gameId = game.appId;

          if (!gamesMap.has(gameId)) {
            gamesMap.set(gameId, {
              gameId: gameId,
              name: game.name || `Jeu ${gameId}`,
              subscribers: [],
              lastNewsTimestamp: game.lastNewsTimestamp || 0,
            });
          }

          // Ajouter l'utilisateur aux subscribers s'il n'y est pas déjà
          const gameData = gamesMap.get(gameId);
          if (!gameData.subscribers.includes(user.steamId)) {
            gameData.subscribers.push(user.steamId);
          }

          // Garder le timestamp le plus récent
          if (game.lastNewsTimestamp > gameData.lastNewsTimestamp) {
            gameData.lastNewsTimestamp = game.lastNewsTimestamp;
          }
        });
      }
    });

    console.log(`🎯 ${gamesMap.size} jeux uniques à créer`);

    // Créer les documents GameSubscription
    const subscriptionsToCreate = Array.from(gamesMap.values());

    if (subscriptionsToCreate.length > 0) {
      await GameSubscription.insertMany(subscriptionsToCreate);
      console.log(
        `✅ ${subscriptionsToCreate.length} GameSubscriptions créées avec succès !`
      );

      // Afficher quelques statistiques
      const totalSubscribers = subscriptionsToCreate.reduce(
        (sum, game) => sum + game.subscribers.length,
        0
      );
      console.log(`📈 Statistiques:`);
      console.log(`   - ${subscriptionsToCreate.length} jeux uniques`);
      console.log(`   - ${totalSubscribers} abonnements au total`);
      console.log(
        `   - ${(totalSubscribers / subscriptionsToCreate.length).toFixed(
          1
        )} abonnés par jeu en moyenne`
      );

      // Afficher les jeux les plus populaires
      const popularGames = subscriptionsToCreate
        .sort((a, b) => b.subscribers.length - a.subscribers.length)
        .slice(0, 5);

      console.log(`🏆 Top 5 des jeux les plus suivis:`);
      popularGames.forEach((game, index) => {
        console.log(
          `   ${index + 1}. ${game.name} (${game.subscribers.length} abonnés)`
        );
      });
    }

    console.log("🎉 Migration terminée avec succès !");
  } catch (error) {
    console.error("❌ Erreur lors de la migration:", error);
    throw error;
  }
}

/**
 * Script de vérification de la cohérence après migration
 */
async function verifyMigration() {
  try {
    console.log("🔍 Vérification de la cohérence de la migration...");

    const users = await User.find({ "followedGames.0": { $exists: true } });
    const subscriptions = await GameSubscription.find({});

    let totalFollowedGames = 0;
    let totalSubscribers = 0;

    users.forEach((user) => {
      if (user.followedGames) {
        totalFollowedGames += user.followedGames.length;
      }
    });

    subscriptions.forEach((sub) => {
      totalSubscribers += sub.subscribers.length;
    });

    console.log(`📊 Vérification:`);
    console.log(`   - Jeux suivis dans users: ${totalFollowedGames}`);
    console.log(`   - Abonnements dans subscriptions: ${totalSubscribers}`);

    if (totalFollowedGames === totalSubscribers) {
      console.log("✅ Migration cohérente !");
    } else {
      console.log("⚠️  Incohérence détectée. Vérifiez les données.");
    }
  } catch (error) {
    console.error("❌ Erreur lors de la vérification:", error);
  }
}

// Si le script est exécuté directement
if (require.main === module) {
  // Se connecter à MongoDB
  mongoose
    .connect(
      process.env.MONGODB_URI || "mongodb://localhost:27017/steam-actu",
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      }
    )
    .then(() => {
      console.log("📡 Connecté à MongoDB");

      migrateToGameSubscriptions()
        .then(() => verifyMigration())
        .then(() => {
          console.log("🏁 Script terminé");
          process.exit(0);
        })
        .catch((error) => {
          console.error("💥 Erreur fatale:", error);
          process.exit(1);
        });
    })
    .catch((error) => {
      console.error("❌ Erreur de connexion MongoDB:", error);
      process.exit(1);
    });
}

module.exports = {
  migrateToGameSubscriptions,
  verifyMigration,
};
