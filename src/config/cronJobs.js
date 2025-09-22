const cron = require("node-cron");
const gamesSyncService = require("../services/gamesSyncService");
const newsChecker = require("../utils/newsChecker-v2"); // Nouveau newsChecker optimisé

/**
 * Initialise toutes les tâches planifiées de l'application
 */
function initCronJobs() {
  console.log("Initialisation des tâches planifiées...");

  // Vérification des actualités toutes les heures
  // Format: sec min hour dayOfMonth month dayOfWeek
  cron.schedule("0 0 * * * *", async () => {
    console.log("Exécution de la tâche planifiée: vérification des actualités");
    try {
      const notificationsSent = await newsChecker.checkNewsForAllUsers();
      console.log(
        `Tâche terminée: ${notificationsSent} notifications envoyées`
      );
    } catch (error) {
      console.error("Erreur lors de la vérification des actualités:", error);
    }
  });

  // Synchronisation des bibliothèques - approche par groupes
  // Nous divisons les utilisateurs en 12 groupes et synchronisons un groupe différent chaque heure
  // Chaque utilisateur est ainsi synchronisé toutes les 12 heures
  cron.schedule("0 30 * * * *", async () => {
    const currentHour = new Date().getHours();
    const groupIndex = currentHour % 12;
    const totalGroups = 12;

    console.log(
      `Exécution de la tâche planifiée: synchronisation du groupe ${
        groupIndex + 1
      }/${totalGroups} de bibliothèques`
    );

    try {
      const stats = await gamesSyncService.syncUserGroupByIndex(
        groupIndex,
        totalGroups
      );
      console.log(
        `Statistiques de synchronisation du groupe ${groupIndex + 1}:`,
        stats
      );
    } catch (error) {
      console.error(
        `Erreur lors de la synchronisation du groupe ${groupIndex + 1}:`,
        error
      );
    }
  });

  // Synchronisation complète une fois par semaine pour s'assurer que personne n'est oublié
  // Exécution le dimanche à 3h du matin
  cron.schedule("0 0 3 * * 0", async () => {
    console.log(
      "Exécution de la tâche planifiée: synchronisation complète hebdomadaire"
    );
    try {
      const stats = await gamesSyncService.syncAllUsersGames();
      console.log("Statistiques de synchronisation complète:", stats);
    } catch (error) {
      console.error("Erreur lors de la synchronisation complète:", error);
    }
  });

  // Si vous souhaitez ajouter d'autres tâches planifiées, vous pouvez les ajouter ici

  console.log("Tâches planifiées initialisées avec succès");
}

module.exports = {
  initCronJobs,
};
