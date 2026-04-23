/**
 * Scheduler Agenda.js : jobs persistants en MongoDB + locking natif.
 * Remplace node-cron + JobLock custom.
 *
 * Trois jobs récurrents :
 *   - news-check       : toutes les 30 min
 *   - user-group-sync  : tous les jours 03:00 → 14:00 (12 groupes, 1/h)
 *   - wishlist-sync    : tous les jours 03:30 → 14:30 (12 groupes, +30min d'offset)
 *
 * Le décalage de 30 min entre library et wishlist est critique pour étaler
 * les appels Steam API sur la fenêtre horaire.
 */

const { Agenda } = require('agenda');
const { checkNews, syncUserGroup, syncWishlists } = require('./tasks');
const { CRON_CONFIG, SERVER_CONFIG } = require('../app');

const TZ = CRON_CONFIG.TIMEZONE;
const GROUPS_TOTAL = Math.max(Number(CRON_CONFIG.GROUPS_TOTAL) || 1, 1);

// Les syncs bibliothèque et wishlist peuvent dépasser les 10 min par défaut
// d'Agenda pour un gros groupe d'utilisateurs. On étend à 15 min pour éviter
// qu'un autre worker ne reprenne le job alors qu'il tourne encore.
const LONG_JOB_LOCK_LIFETIME_MS = 15 * 60 * 1000;

const JOBS = {
  NEWS_CHECK: 'news-check',
  USER_GROUP_SYNC: 'user-group-sync',
  WISHLIST_SYNC: 'wishlist-sync',
};

let agenda = null;

// Heure locale Europe/Paris → [0..23]
function getParisHour() {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === 'hour');
  return Number(hourPart?.value ?? '0');
}

// Mappe 03→0, 04→1, ..., 14→11
function hourToGroupIndex(hour /* 0..23 */) {
  return (hour - 3 + 24) % GROUPS_TOTAL;
}

/**
 * Wrapper standardisé pour exécuter une tâche cron.
 * Reproduit le comportement de l'ancien taskExecutor :
 * logs [CRON][START] / [CRON][DONE] / [CRON][ERROR] + durée + result.message.
 *
 * Les erreurs sont capturées et converties en log plutôt que remontées à
 * Agenda : on garde la sémantique historique "un échec ne re-queue pas".
 */
async function runTask(label, taskFunction) {
  const started = Date.now();
  console.log(`[CRON][START] ${label}`);

  try {
    const result = await taskFunction();
    const ms = Date.now() - started;
    const sec = Math.round(ms / 1000);
    const msg =
      result && typeof result === 'object' && result.message
        ? ` → ${result.message}`
        : '';
    console.log(`[CRON][DONE] ${label} in ${sec}s${msg}`);

    if (result && typeof result === 'object') {
      console.log(
        JSON.stringify({
          level: 'info',
          tag: 'cron_done',
          task: label,
          durationMs: ms,
          ...result,
        })
      );
    }

    return result;
  } catch (error) {
    console.error(`[CRON][ERROR] ${label}:`, error?.stack || error);
    return null;
  }
}

/**
 * Initialise Agenda, définit les jobs et démarre le scheduler.
 *
 * On passe l'URI Mongo plutôt qu'une instance `Db` Mongoose :
 * mongoose 8 embarque mongodb@6 alors qu'agenda@5 embarque mongodb@4.
 * Partager un Db cross-version exposerait à des ruptures d'API silencieuses
 * (notamment sur `findOneAndUpdate`). Agenda ouvre donc sa propre connexion
 * avec son driver bundled : une seule collection `agendaJobs` en plus, trivial.
 */
async function initAgenda() {
  if (agenda) return agenda;

  agenda = new Agenda({
    db: {
      address: SERVER_CONFIG.MONGODB_URI,
      collection: 'agendaJobs',
    },
    processEvery: '30 seconds',
    defaultLockLifetime: 10 * 60 * 1000,
  });

  // Erreurs opérationnelles (connexion, driver, etc.)
  agenda.on('error', (err) => {
    console.error('[CRON][AGENDA_ERROR]', err?.stack || err);
  });

  // --- Définition des jobs ---

  agenda.define(
    JOBS.NEWS_CHECK,
    { lockLifetime: LONG_JOB_LOCK_LIFETIME_MS },
    async () => {
      await runTask('NEWS_CHECK (every 30min)', checkNews);
    }
  );

  agenda.define(
    JOBS.USER_GROUP_SYNC,
    { lockLifetime: LONG_JOB_LOCK_LIFETIME_MS },
    async () => {
      const groupIndex = hourToGroupIndex(getParisHour());
      await runTask(
        `USER_GROUP_SYNC (groupe ${groupIndex + 1}/${GROUPS_TOTAL})`,
        () => syncUserGroup({ groupIndex, groupsTotal: GROUPS_TOTAL })
      );
    }
  );

  agenda.define(
    JOBS.WISHLIST_SYNC,
    { lockLifetime: LONG_JOB_LOCK_LIFETIME_MS },
    async () => {
      const groupIndex = hourToGroupIndex(getParisHour());
      await runTask(
        `WISHLIST_SYNC (groupe ${groupIndex + 1}/${GROUPS_TOTAL})`,
        () => syncWishlists({ groupIndex, groupsTotal: GROUPS_TOTAL })
      );
    }
  );

  // --- Démarrage + scheduling ---

  await agenda.start();

  // `agenda.every()` est idempotent : appeler plusieurs fois avec le même nom
  // met à jour le `repeatInterval`/`repeatTimezone` du document existant au
  // lieu de créer un doublon. Safe à chaque boot.
  // Format 5 champs : min hour day-of-month month day-of-week
  await agenda.every('*/30 * * * *', JOBS.NEWS_CHECK, {}, { timezone: TZ });
  await agenda.every(
    '0 3-14 * * *',
    JOBS.USER_GROUP_SYNC,
    {},
    { timezone: TZ }
  );
  await agenda.every(
    '30 3-14 * * *',
    JOBS.WISHLIST_SYNC,
    {},
    { timezone: TZ }
  );

  console.log(
    '[CRON] Agenda démarré — jobs persistants dans MongoDB (collection: agendaJobs)'
  );
  return agenda;
}

/**
 * Arrête proprement Agenda : attend la fin des jobs en cours (dans la limite
 * de `lockLifetime`) et relâche les locks. À appeler AVANT `mongoose.disconnect()`
 * dans le graceful shutdown, sinon certains jobs resteraient marqués "running".
 */
async function stopAgenda() {
  if (!agenda) return;
  try {
    await agenda.stop();
    console.log('[CRON] Agenda arrêté');
  } catch (error) {
    console.error(
      '[CRON] Erreur arrêt Agenda:',
      error?.message || error
    );
  } finally {
    agenda = null;
  }
}

/**
 * Retourne l'instance Agenda initialisee, ou `null` si `initAgenda()` n'a pas
 * encore ete appele (typiquement en phase de boot avant `startServer`).
 * Utilise par le service admin pour introspecter `nextRunAt` / `lastRunAt` /
 * `lockedAt` sans recreer de connexion Mongo.
 */
function getAgenda() {
  return agenda;
}

module.exports = {
  initAgenda,
  stopAgenda,
  getAgenda,
  JOBS,
};
