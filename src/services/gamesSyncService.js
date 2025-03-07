const User = require("../models/User");
const steamService = require("./steamService");

/**
 * Synchronise les bibliothèques de jeux de tous les utilisateurs
 * @returns {Promise<Object>} Statistiques de synchronisation
 */
async function syncAllUsersGames() {
  console.log(
    "Démarrage de la synchronisation des bibliothèques de jeux pour tous les utilisateurs..."
  );

  const stats = {
    usersProcessed: 0,
    usersWithNewGames: 0,
    totalNewGames: 0,
    errors: 0,
  };

  try {
    // Récupérer tous les utilisateurs
    const users = await User.find({});
    stats.usersProcessed = users.length;

    console.log(
      `Synchronisation des bibliothèques pour ${users.length} utilisateurs`
    );

    // Pour chaque utilisateur, synchroniser sa bibliothèque
    for (const user of users) {
      try {
        const userStats = await syncUserGames(user.steamId);

        if (userStats.newGamesCount > 0) {
          stats.usersWithNewGames++;
          stats.totalNewGames += userStats.newGamesCount;
        }
      } catch (error) {
        console.error(
          `Erreur lors de la synchronisation pour l'utilisateur ${user.steamId}:`,
          error
        );
        stats.errors++;
      }
    }

    console.log(
      "Synchronisation terminée avec les statistiques suivantes:",
      stats
    );
    return stats;
  } catch (error) {
    console.error("Erreur lors de la synchronisation globale:", error);
    throw error;
  }
}

/**
 * Synchronise la bibliothèque de jeux d'un utilisateur spécifique
 * @param {string} steamId - ID Steam de l'utilisateur
 * @returns {Promise<Object>} Statistiques de synchronisation pour cet utilisateur
 */
async function syncUserGames(steamId) {
  console.log(`Synchronisation des jeux pour l'utilisateur ${steamId}`);

  const stats = {
    steamId,
    newGamesCount: 0,
    newGames: [],
  };

  try {
    // Récupérer l'utilisateur
    const user = await User.findOne({ steamId });

    if (!user) {
      console.log(`Aucun utilisateur trouvé avec le SteamID ${steamId}`);
      return stats;
    }

    // Récupérer les jeux actuels depuis l'API Steam
    const currentGames = await steamService.getUserGames(steamId);

    if (!currentGames || !Array.isArray(currentGames)) {
      console.error(
        `Impossible de récupérer les jeux pour ${steamId} ou format invalide`
      );
      return stats;
    }

    // Extraire les appIds de la bibliothèque actuelle en base de données
    // Si l'utilisateur n'a pas de liste de jeux, on crée un tableau vide
    const savedGamesMap = new Map();
    const followedGamesMap = new Map();

    // Construire une Map des jeux suivis pour un accès rapide
    if (user.followedGames && Array.isArray(user.followedGames)) {
      user.followedGames.forEach((game) => {
        followedGamesMap.set(game.appId, true);
      });
    }

    // Détecter les nouveaux jeux
    const newGames = [];

    for (const game of currentGames) {
      const appId = game.appid.toString();

      // Vérifier si c'est un nouveau jeu
      if (!savedGamesMap.has(appId)) {
        newGames.push({
          appId,
          name: game.name,
          logoUrl: game.img_logo_url
            ? `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
            : null,
        });
      }
    }

    stats.newGamesCount = newGames.length;
    stats.newGames = newGames;

    if (newGames.length > 0) {
      console.log(
        `${newGames.length} nouveaux jeux détectés pour l'utilisateur ${steamId}`
      );

      // Mettre à jour l'utilisateur avec les nouveaux jeux si l'utilisateur a activé les notifications automatiques
      // Note: Ce code suppose que user.notificationSettings.autoFollowNewGames existe
      // Il faudra peut-être ajouter cette option dans votre modèle User
      if (
        user.notificationSettings &&
        user.notificationSettings.autoFollowNewGames
      ) {
        const updatedFollowedGames = [
          ...(user.followedGames || []),
          ...newGames,
        ];
        user.followedGames = updatedFollowedGames;
        await user.save();
        console.log(
          `${newGames.length} jeux ajoutés automatiquement aux jeux suivis pour ${steamId}`
        );
      }

      // Si vous avez un système de notification push, vous pourriez l'appeler ici
      // notificationService.sendNewGamesNotification(user, newGames);
    } else {
      console.log(`Aucun nouveau jeu détecté pour l'utilisateur ${steamId}`);
    }

    return stats;
  } catch (error) {
    console.error(
      `Erreur lors de la synchronisation pour l'utilisateur ${steamId}:`,
      error
    );
    throw error;
  }
}

module.exports = {
  syncAllUsersGames,
  syncUserGames,
};
