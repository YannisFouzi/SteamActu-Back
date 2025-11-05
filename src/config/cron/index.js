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
 *
 * ⚠️ NOUVELLE STRATÉGIE 2025-11-04 :
 * - Prioriser freshness des news (1h) pour notifications push réactives
 * - Réduire drastiquement fréquence des syncs lourdes (bibliothèque/wishlist → hebdo)
 * - Accepter retard 1-7 jours sur détection nouveaux jeux/wishlist (use case acceptable)
 * - Rotation intelligente NEWS_CHECK : max 150 appels API/run
 */
function initCronJobs() {
  console.log("\n" + "=".repeat(70));
  console.log("🔧 INITIALISATION DES TÂCHES PLANIFIÉES");
  console.log("=".repeat(70));

  /**
   * USER_GROUP_SYNC : Synchronisation des jeux possédés - 1×/SEMAINE (dimanche 3h)
   * - Rotation 12 groupes d'utilisateurs
   * - Cooldown 6h par user
   * - Tous les users seront sync en 1 dimanche
   * - Acceptable : nouveaux jeux détectés dans la semaine
   */
  cron.schedule(SCHEDULES.USER_GROUP_SYNC, () => {
    executeTask("👥 Sync jeux possédés (hebdo)", syncUserGroup);
  });

  /**
   * FULL_SYNC : Filet de sécurité global - 1×/MOIS (le 1er à 2h)
   * - Rattrape les éventuels bugs/erreurs
   * - Impact négligeable sur quota API
   */
  cron.schedule(SCHEDULES.FULL_SYNC, () => {
    executeTask("🔄 Sync complète (mensuelle)", syncAllUsers);
  });

  /**
   * NEWS_CHECK : Vérification actualités + notifications push - TOUTES LES 1 HEURE
   * - PRIORITÉ MAXIMALE : notifications en quasi temps réel
   * - Rotation intelligente : 150 appels API max/run
   * - Jeux least-recently-checked en priorité
   * - 24 runs/jour × 150 appels = 3,600 appels/jour (3.6% quota Steam)
   */
  cron.schedule(SCHEDULES.NEWS_CHECK, () => {
    executeTask("📰 Vérif news + notifs (1h)", checkNews);
  });

  /**
   * WISHLIST_SYNC : Détection nouveaux jeux wishlistés - 1×/SEMAINE (lundi 3h)
   * - Acceptable : nouveaux jeux wishlistés détectés dans la semaine
   * - Auto-follow si activé
   */
  cron.schedule(SCHEDULES.WISHLIST_SYNC, () => {
    executeTask("🎯 Sync wishlists (hebdo)", syncWishlists);
  });

  /**
   * LIBRARY_SYNC : DÉSACTIVÉ (redondant avec USER_GROUP_SYNC)
   * - Même fonctionnalité que USER_GROUP_SYNC
   * - Détection jeux supprimés intégrée dans gameSync/userProcessor
   */
  // cron.schedule(SCHEDULES.LIBRARY_SYNC, () => {
  //   executeTask("📚 Sync bibliothèques", syncLibraries);
  // });

  console.log("\n✅ TÂCHES PLANIFIÉES INITIALISÉES AVEC SUCCÈS\n");
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│ TÂCHE                │ FRÉQUENCE          │ PROCHAINE EXEC     │");
  console.log("├─────────────────────────────────────────────────────────────────┤");
  console.log("│ 📰 NEWS_CHECK        │ Toutes les 1h      │ Heure suivante     │");
  console.log("│ 👥 USER_GROUP_SYNC   │ 1×/semaine         │ Dimanche 3h        │");
  console.log("│ 🎯 WISHLIST_SYNC     │ 1×/semaine         │ Lundi 3h           │");
  console.log("│ 🔄 FULL_SYNC         │ 1×/mois            │ 1er du mois 2h     │");
  console.log("│ 📚 LIBRARY_SYNC      │ DÉSACTIVÉ          │ -                  │");
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("\n📊 ESTIMATION APPELS API/JOUR (100 users) :");
  console.log("  - NEWS_CHECK : ~3,600 appels (24h × 150 jeux/run)");
  console.log("  - USER_GROUP_SYNC : ~14 appels (1 dimanche/semaine ÷ 7)");
  console.log("  - WISHLIST_SYNC : ~14 appels (1 lundi/semaine ÷ 7)");
  console.log("  - TOTAL : ~3,628 appels/jour (3.6% du quota Steam)");
  console.log("=".repeat(70) + "\n");
}

module.exports = {
  initCronJobs,
};
