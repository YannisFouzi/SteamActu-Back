const User = require("../models/User");
const steamService = require("./steamService");

/**
 * Synchronise les jeux de tous les utilisateurs enregistrés
 * @returns {Promise<Object>} Statistiques de synchronisation
 */
async function syncAllUsersGames() {
  console.log(
    "Démarrage de la synchronisation automatique des bibliothèques..."
  );
  const stats = {
    totalUsers: 0,
    usersProcessed: 0,
    usersWithNewGames: 0,
    totalNewGames: 0,
    errors: 0,
  };

  try {
    // Récupérer tous les utilisateurs
    const users = await User.find({});
    stats.totalUsers = users.length;
    console.log(`Synchronisation des jeux pour ${users.length} utilisateurs`);

    // Pour chaque utilisateur
    for (const user of users) {
      try {
        stats.usersProcessed++;
        const result = await syncUserGames(user);

        if (result.newGames.length > 0) {
          stats.usersWithNewGames++;
          stats.totalNewGames += result.newGames.length;
        }
      } catch (error) {
        console.error(
          `Erreur lors de la synchronisation des jeux pour l'utilisateur ${user.username}:`,
          error
        );
        stats.errors++;
      }
    }

    console.log("Synchronisation automatique terminée:", stats);
    return stats;
  } catch (error) {
    console.error(
      "Erreur lors de la synchronisation automatique des jeux:",
      error
    );
    throw error;
  }
}

/**
 * Synchronise un groupe spécifique d'utilisateurs basé sur un index de groupe
 * Cette méthode permet de répartir la charge en synchronisant différents groupes d'utilisateurs à différents moments
 * @param {number} groupIndex - Index du groupe à synchroniser (0-basé)
 * @param {number} totalGroups - Nombre total de groupes
 * @returns {Promise<Object>} Statistiques de synchronisation pour ce groupe
 */
async function syncUserGroupByIndex(groupIndex, totalGroups) {
  console.log(
    `Synchronisation du groupe ${groupIndex + 1}/${totalGroups} d'utilisateurs`
  );

  const stats = {
    groupIndex,
    totalGroups,
    totalUsers: 0,
    usersProcessed: 0,
    usersWithNewGames: 0,
    totalNewGames: 0,
    errors: 0,
  };

  try {
    // Récupérer tous les utilisateurs
    const allUsers = await User.find({});
    stats.totalUsers = allUsers.length;

    // Si aucun utilisateur, retourner immédiatement
    if (allUsers.length === 0) {
      console.log("Aucun utilisateur trouvé, rien à synchroniser.");
      return stats;
    }

    // Calculer combien d'utilisateurs par groupe
    const groupSize = Math.ceil(allUsers.length / totalGroups);

    // Déterminer l'index de début et de fin pour ce groupe
    const startIndex = groupIndex * groupSize;
    const endIndex = Math.min(startIndex + groupSize, allUsers.length);

    // Extraire les utilisateurs de ce groupe
    const groupUsers = allUsers.slice(startIndex, endIndex);

    console.log(
      `Traitement de ${groupUsers.length} utilisateurs du groupe ${
        groupIndex + 1
      }/${totalGroups} (index ${startIndex}-${endIndex - 1})`
    );

    // Synchroniser chaque utilisateur du groupe
    for (const user of groupUsers) {
      try {
        stats.usersProcessed++;
        const result = await syncUserGames(user);

        if (result.newGames && result.newGames.length > 0) {
          stats.usersWithNewGames++;
          stats.totalNewGames += result.newGames.length;
        }
      } catch (error) {
        console.error(
          `Erreur lors de la synchronisation de l'utilisateur ${user.username}:`,
          error
        );
        stats.errors++;
      }
    }

    console.log(
      `Synchronisation du groupe ${groupIndex + 1}/${totalGroups} terminée:`,
      stats
    );
    return stats;
  } catch (error) {
    console.error(
      `Erreur lors de la synchronisation du groupe ${
        groupIndex + 1
      }/${totalGroups}:`,
      error
    );
    stats.errors++;
    return stats;
  }
}

/**
 * Synchronise les jeux d'un utilisateur spécifique
 * @param {Object} user - Utilisateur pour lequel synchroniser les jeux
 * @returns {Promise<Object>} Résultat de la synchronisation
 */
async function syncUserGames(user) {
  const result = {
    userId: user._id,
    steamId: user.steamId,
    username: user.username,
    newGames: [],
    updatedGames: [],
    error: null,
    lastSyncTime: new Date(),
  };

  try {
    console.log(
      `Synchronisation des jeux pour ${user.username} (${user.steamId})`
    );

    // Vérifier si la dernière synchronisation est récente (moins de 6 heures)
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const lastSyncTime = user.lastChecked || new Date(0);

    if (lastSyncTime > sixHoursAgo) {
      console.log(
        `Utilisateur ${
          user.username
        } synchronisé récemment (${lastSyncTime.toISOString()}), en attente.`
      );
      return {
        ...result,
        skipped: true,
        message: "Synchronisation récente, ignorée",
      };
    }

    // Récupérer la liste actuelle des jeux
    const userGames = await steamService.getUserGames(user.steamId);

    if (!userGames || !Array.isArray(userGames)) {
      console.error(`Réponse invalide de l'API Steam pour ${user.username}`);
      result.error = "Réponse invalide de l'API Steam";
      return result;
    }

    // Liste des jeux actuellement suivis
    const followedGamesMap = new Map();
    if (user.followedGames && Array.isArray(user.followedGames)) {
      user.followedGames.forEach((game) => {
        followedGamesMap.set(game.appId, game);
      });
    }

    // Liste des jeux actuellement synchronisés
    const syncedGamesMap = new Map();
    if (user.lastSyncedGames && Array.isArray(user.lastSyncedGames)) {
      user.lastSyncedGames.forEach((game) => {
        syncedGamesMap.set(game.appId, game);
      });
    }

    // Nouveaux jeux détectés
    const newGames = [];
    const updatedSyncedGames = [];
    const updatedFollowedGames = Array.from(followedGamesMap.values());

    // Pour chaque jeu dans la bibliothèque Steam
    for (const game of userGames) {
      const appId = game.appid.toString();

      // Si le jeu n'est pas dans lastSyncedGames, c'est un nouveau jeu
      if (!syncedGamesMap.has(appId)) {
        console.log(
          `Nouveau jeu détecté pour ${user.username}: ${game.name} (${appId})`
        );

        // Ajouter aux jeux synchronisés
        const newSyncedGame = {
          appId,
          name: game.name,
          logoUrl: game.img_logo_url
            ? `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
            : null,
          addedAt: new Date(),
        };

        updatedSyncedGames.push(newSyncedGame);

        // Ajouter aux nouveaux jeux détectés
        newGames.push({
          appId,
          name: game.name,
        });

        // Si l'option autoFollowNewGames est activée, ajouter le jeu aux jeux suivis
        if (
          user.notificationSettings &&
          user.notificationSettings.autoFollowNewGames
        ) {
          if (!followedGamesMap.has(appId)) {
            const followedGame = {
              appId,
              name: game.name,
              logoUrl: game.img_logo_url
                ? `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
                : null,
              lastNewsTimestamp: 0,
              lastUpdateTimestamp: Date.now(), // Marquer comme récemment ajouté
            };

            updatedFollowedGames.push(followedGame);
            result.updatedGames.push({
              appId,
              name: game.name,
              action: "added",
            });
          }
        }
      } else {
        // Le jeu est déjà dans lastSyncedGames, conserver ses informations avec mises à jour si nécessaire
        const existingGame = syncedGamesMap.get(appId);

        // Mettre à jour le logo si nécessaire
        if (game.img_logo_url && !existingGame.logoUrl) {
          existingGame.logoUrl = `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`;
          result.updatedGames.push({
            appId,
            name: game.name,
            action: "updated",
          });
        }

        updatedSyncedGames.push(existingGame);
      }
    }

    // Mettre à jour l'utilisateur si des changements ont été détectés
    const hasChanges = newGames.length > 0 || result.updatedGames.length > 0;

    if (hasChanges) {
      // Mettre à jour lastSyncedGames
      user.lastSyncedGames = updatedSyncedGames;

      // Mettre à jour followedGames si nécessaire
      if (
        user.notificationSettings &&
        user.notificationSettings.autoFollowNewGames &&
        newGames.length > 0
      ) {
        user.followedGames = updatedFollowedGames;
      }

      // Mettre à jour la date de dernière vérification
      user.lastChecked = new Date();

      // Enregistrer les modifications
      await user.save();

      console.log(
        `${newGames.length} nouveaux jeux ajoutés pour ${user.username}`
      );
      result.newGames = newGames;
    } else {
      // Même s'il n'y a pas de changement, mettre à jour la date de dernière vérification
      user.lastChecked = new Date();
      await user.save();

      console.log(`Aucun nouveau jeu détecté pour ${user.username}`);
    }

    return result;
  } catch (error) {
    console.error(
      `Erreur lors de la synchronisation des jeux pour ${user.username}:`,
      error
    );
    result.error = error.message;
    return result;
  }
}

module.exports = {
  syncAllUsersGames,
  syncUserGames,
  syncUserGroupByIndex,
};
