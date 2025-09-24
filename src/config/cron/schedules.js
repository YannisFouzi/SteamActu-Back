/**
 * Configuration des horaires pour les tâches cron
 */

const SCHEDULES = {
  // Vérification des actualités toutes les heures
  NEWS_CHECK: "0 0 * * * *",

  // Synchronisation par groupe toutes les 30 minutes après l'heure
  USER_GROUP_SYNC: "0 30 * * * *",

  // Synchronisation complète le dimanche à 3h du matin
  FULL_SYNC: "0 0 3 * * 0",
};

module.exports = {
  SCHEDULES,
};
