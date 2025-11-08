/**
 * Format node-cron : "second minute hour day month dayOfWeek"
 * Europe/Paris gérée dans index.js via { timezone }
 */
const SCHEDULES = {
  // Vérification des news toutes les heures à HH:00:00
  NEWS_CHECK: '0 0 * * * *',

  // USER_GROUP_SYNC : tous les jours de 03:00 à 14:00 (12 exécutions = 12 groupes)
  USER_GROUP_SYNC_WINDOW: '0 0 3-14 * * *',

  // WISHLIST_SYNC : tous les jours de 03:30 à 14:30 (12 exécutions = 12 groupes, décalé de 30 min)
  // Si pas de méthode groupée côté service, seul le groupe 0 fera un "full" (voir tasks.js)
  WISHLIST_SYNC_WINDOW: '0 30 3-14 * * *',

  // FULL_SYNC : non planifié (manuel si besoin)
  // FULL_SYNC: '0 0 2 1 * *',
};

module.exports = { SCHEDULES };
