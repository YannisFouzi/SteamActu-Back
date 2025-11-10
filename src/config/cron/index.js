const cron = require('node-cron');
const { executeTask } = require('./taskExecutor');
const { checkNews, syncUserGroup, syncWishlists } = require('./tasks');
const { SCHEDULES } = require('./schedules');
const { CRON_CONFIG } = require('../app');

const TZ = CRON_CONFIG.TIMEZONE;
const GROUPS_TOTAL = Math.max(Number(CRON_CONFIG.GROUPS_TOTAL) || 1, 1);

// Heure locale Europe/Paris -> [0..23]
function getParisHour() {
  const parts = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', hour12: false })
    .formatToParts(new Date());
  const hourPart = parts.find(p => p.type === 'hour');
  return Number(hourPart?.value ?? '0');
}

// Mappe 03→0, 04→1, ..., 14→11
function hourToGroupIndex(hour /* 0..23 */) {
  return (hour - 3 + 24) % GROUPS_TOTAL;
}

function initCronJobs() {
  // NEWS_CHECK : toutes les heures
  cron.schedule(SCHEDULES.NEWS_CHECK, () => {
    executeTask('📰 NEWS_CHECK (hourly)', checkNews);
  }, { timezone: TZ });

  // USER_GROUP_SYNC : tous les jours 03..14 (12 groupes)
  cron.schedule(SCHEDULES.USER_GROUP_SYNC_WINDOW, () => {
    const h = getParisHour();
    const groupIndex = hourToGroupIndex(h);
    executeTask(`👥 USER_GROUP_SYNC (groupe ${groupIndex + 1}/${GROUPS_TOTAL})`, () =>
      syncUserGroup({ groupIndex, groupsTotal: GROUPS_TOTAL })
    );
  }, { timezone: TZ });

  // WISHLIST_SYNC : tous les jours 03:30..14:30 (12 groupes), décalé de 30min
  // Si pas de méthode groupée côté service, seul le groupeIndex=0 exécute un full (voir tasks.js)
  cron.schedule(SCHEDULES.WISHLIST_SYNC_WINDOW, () => {
    const h = getParisHour();
    const groupIndex = hourToGroupIndex(h);
    executeTask(`🎯 WISHLIST_SYNC (groupe ${groupIndex + 1}/${GROUPS_TOTAL})`, () =>
      syncWishlists({ groupIndex, groupsTotal: GROUPS_TOTAL })
    );
  }, { timezone: TZ });

  // FULL_SYNC disponible mais non planifié
  // cron.schedule(SCHEDULES.FULL_SYNC, () => {
  //   executeTask('🔄 FULL_SYNC (manuel conseillé)', syncAllUsers);
  // }, { timezone: TZ });
}

module.exports = { initCronJobs };
