const cron = require("node-cron");
const { executeTask } = require("./taskExecutor");
const { checkNews, syncUserGroup, syncAllUsers } = require("./tasks");
const { SCHEDULES } = require("./schedules");

/**
 * Initialise toutes les tâches planifiées de l'application
 */
function initCronJobs() {
  console.log("Initialisation des tâches planifiées...");

  // Vérification des actualités toutes les heures
  cron.schedule(SCHEDULES.NEWS_CHECK, () => {
    executeTask("vérification des actualités", checkNews);
  });

  // Synchronisation par groupe toutes les 30 minutes après l'heure
  cron.schedule(SCHEDULES.USER_GROUP_SYNC, () => {
    executeTask("synchronisation par groupe", syncUserGroup);
  });

  // Synchronisation complète hebdomadaire le dimanche à 3h
  cron.schedule(SCHEDULES.FULL_SYNC, () => {
    executeTask("synchronisation complète hebdomadaire", syncAllUsers);
  });

  console.log("Tâches planifiées initialisées avec succès");
}

module.exports = {
  initCronJobs,
};
