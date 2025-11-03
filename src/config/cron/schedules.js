/**
 * Configuration des horaires pour les tâches cron
 * Format: "secondes minutes heures jour mois jour_semaine"
 */

const SCHEDULES = {
  // Vérification des actualités toutes les heures (avec rotation intelligente)
  NEWS_CHECK: "0 0 * * * *",

  // Synchronisation par groupe toutes les 30 minutes après l'heure
  USER_GROUP_SYNC: "0 30 * * * *",

  // Synchronisation complète le dimanche à 3h du matin
  FULL_SYNC: "0 0 3 * * 0",

  // 🆕 Synchronisation des wishlists toutes les 6 heures (à 0h, 6h, 12h, 18h)
  WISHLIST_SYNC: "0 0 0,6,12,18 * * *",

  // 🆕 Synchronisation des bibliothèques toutes les 6 heures (à 3h, 9h, 15h, 21h)
  LIBRARY_SYNC: "0 0 3,9,15,21 * * *",
};

module.exports = {
  SCHEDULES,
};
