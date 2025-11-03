const cron = require("node-cron");
const { executeTask } = require("./taskExecutor");
const {
  checkNews,
  syncUserGroup,
  syncAllUsers,
  syncWishlists,
  syncLibraries,
} = require("./tasks");
const { SCHEDULES } = require("./schedules");

/**
 * Initialise toutes les tâches planifiées de l'application
 */
function initCronJobs() {
  console.log("🔧 Initialisation des tâches planifiées...");

  // ⚠️ DÉSACTIVÉ : Vérification des actualités de tous les jeux (trop gourmand)
  // L'app affiche maintenant uniquement les actus des jeux suivis
  // Pour réactiver : décommenter ci-dessous + frontend NEWS_TAB_ITEMS
  // cron.schedule(SCHEDULES.NEWS_CHECK, () => {
  //   executeTask("📰 Vérification actualités (rotation)", checkNews);
  // });

  // Synchronisation par groupe toutes les 30 minutes après l'heure
  cron.schedule(SCHEDULES.USER_GROUP_SYNC, () => {
    executeTask("👥 Synchronisation par groupe", syncUserGroup);
  });

  // Synchronisation complète hebdomadaire le dimanche à 3h
  cron.schedule(SCHEDULES.FULL_SYNC, () => {
    executeTask("🔄 Synchronisation complète hebdomadaire", syncAllUsers);
  });

  // 🆕 Synchronisation des wishlists toutes les 6h (0h, 6h, 12h, 18h)
  cron.schedule(SCHEDULES.WISHLIST_SYNC, () => {
    executeTask("🎯 Synchronisation wishlists", syncWishlists);
  });

  // 🆕 Synchronisation des bibliothèques toutes les 6h (3h, 9h, 15h, 21h)
  cron.schedule(SCHEDULES.LIBRARY_SYNC, () => {
    executeTask("📚 Synchronisation bibliothèques", syncLibraries);
  });

  console.log("✅ Tâches planifiées initialisées avec succès :");
  // console.log("  📰 Actualités : toutes les heures"); // ⚠️ DÉSACTIVÉ
  console.log("  👥 Groupe : toutes les 30 min");
  console.log("  🔄 Complète : dimanche 3h");
  console.log("  🎯 Wishlists : 0h, 6h, 12h, 18h");
  console.log("  📚 Bibliothèques : 3h, 9h, 15h, 21h");
}

module.exports = {
  initCronJobs,
};
