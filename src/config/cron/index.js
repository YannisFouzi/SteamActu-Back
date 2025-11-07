const cron = require("node-cron");
const { executeTask } = require("./taskExecutor");
const {
  checkNews,
  syncUserGroup,
  syncAllUsers,
  syncWishlists,
} = require("./tasks");
const { SCHEDULES } = require("./schedules");

/**
 * Initialise toutes les tâches planifiées de l'application
 *
 * - Prioriser freshness des news (1h) pour notifications push réactives
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
}

module.exports = {
  initCronJobs,
};
