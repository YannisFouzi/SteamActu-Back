/**
 * Configuration des horaires pour les tâches cron
 * Format: "secondes minutes heures jour mois jour_semaine"
 *
 * - USER_GROUP_SYNC : 30 min → 1×/semaine (dimanche 3h)
 * - WISHLIST_SYNC : 4×/jour → 1×/semaine (lundi 3h)
 * - NEWS_CHECK : 6h → 1h (priorité notifications)
 * - FULL_SYNC : mensuel → filet de sécurité
 * - LIBRARY_SYNC : DÉSACTIVÉ (redondant avec USER_GROUP_SYNC)
 *
 * Philosophie : Prioriser freshness des news, accepter retard sur syncs bibliothèque/wishlist
 */

const SCHEDULES = {
  // Vérification des actualités TOUTES LES 1 HEURE (priorité notifications push)
  // Rotation intelligente : max 150 jeux/run, système de rotation par lastNewsCheck
  NEWS_CHECK: '0 0 * * * *',

  // Synchronisation des jeux possédés 1×/SEMAINE (dimanche 3h)
  // Rotation 12 groupes, cooldown 6h, tous les users seront sync en 1 dimanche
  USER_GROUP_SYNC: '0 0 3 * * 0',

  // Synchronisation complète MENSUELLE (le 1er à 2h) - Filet de sécurité
  FULL_SYNC: '0 0 2 1 * *',

  // Synchronisation des wishlists 1×/SEMAINE (lundi 3h)
  WISHLIST_SYNC: '0 0 3 * * 1',
};

module.exports = {
  SCHEDULES,
};
