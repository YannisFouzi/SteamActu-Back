/**
 * Scheduler Agenda.js : jobs persistants en MongoDB + locking natif.
 * Remplace node-cron + JobLock custom.
 *
 * Trois jobs récurrents :
 *   - news-check       : toutes les 15 min
 *   - user-group-sync  : toutes les heures (12 groupes, cycle complet en 12h)
 *   - wishlist-sync    : toutes les heures à :30 (12 groupes, +30min d'offset)
 *
 * Le décalage de 30 min entre library et wishlist est critique pour étaler
 * les appels Steam API ; chaque user repasse environ 2 fois par jour.
 */

const { Agenda } = require('agenda');
const { checkNews, syncUserGroup, syncWishlists } = require('./tasks');
const { CRON_CONFIG, SERVER_CONFIG } = require('../app');
const logger = require('../../utils/logger');

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

// Mappe les heures sur 12 buckets : 03/15→0, 04/16→1, ..., 02/14→11.
function hourToGroupIndex(hour /* 0..23 */) {
  return (hour - 3 + 24) % GROUPS_TOTAL;
}

/**
 * Wrapper standardisé pour exécuter une tâche cron.
 * Logs structurés via pino :
 *   - `cron_start` : au démarrage du job
 *   - `cron_done`  : à la fin avec durée + result
 *   - `cron_error` : si exception, capturée et convertie en log (pas re-thrown)
 *
 * Les erreurs sont capturées plutôt que remontées à Agenda : on garde la
 * sémantique historique "un échec ne re-queue pas".
 */
async function runTask(label, taskFunction) {
  const started = Date.now();
  logger.info({ task: label }, 'cron_start');

  try {
    const result = await taskFunction();
    const durationMs = Date.now() - started;
    const resultSummary =
      result && typeof result === 'object' ? result : undefined;

    logger.info(
      {
        task: label,
        durationMs,
        ...(resultSummary || {}),
      },
      'cron_done'
    );

    return result;
  } catch (error) {
    logger.error(
      {
        err: error,
        task: label,
        durationMs: Date.now() - started,
      },
      'cron_error'
    );
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

  agenda.on('error', (err) => {
    logger.error({ err }, 'agenda_internal_error');
  });

  // --- Définition des jobs ---

  agenda.define(
    JOBS.NEWS_CHECK,
    { lockLifetime: LONG_JOB_LOCK_LIFETIME_MS },
    async () => {
      await runTask('NEWS_CHECK (every 15min)', checkNews);
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
  await agenda.every('*/15 * * * *', JOBS.NEWS_CHECK, {}, { timezone: TZ });
  await agenda.every('0 * * * *', JOBS.USER_GROUP_SYNC, {}, { timezone: TZ });
  await agenda.every('30 * * * *', JOBS.WISHLIST_SYNC, {}, { timezone: TZ });

  logger.info(
    { collection: 'agendaJobs' },
    'agenda_started'
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
    logger.info('agenda_stopped');
  } catch (error) {
    logger.error({ err: error }, 'agenda_stop_failed');
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
