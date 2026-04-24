/**
 * Logger structuré basé sur pino.
 *
 * Format :
 *   - En dev  (NODE_ENV !== 'production') : pretty-print coloré via pino-pretty
 *   - En prod : JSON brut (une ligne = un objet) → ingéré directement par
 *     Railway / Datadog sans parsing supplémentaire
 *
 * Niveau par défaut : 'info' (surcharge possible via `LOG_LEVEL=debug` en env)
 *
 * Intégration Sentry (si SENTRY_DSN défini) :
 *   - logger.info/warn  → ajouté en breadcrumb (contexte avant une erreur)
 *   - logger.error      → captureException si `err` présent, sinon captureMessage
 *   - logger.fatal      → captureException avec level='fatal'
 *   Cette intégration ne déclenche PAS la création d'un event Sentry tant
 *   qu'un logger.error/fatal n'est pas appelé, limitant le quota consommé.
 *
 * Convention d'usage :
 *   logger.info({ steamId, appId }, 'fcm_token_added');
 *   logger.warn({ errorCode }, 'firebase_invalid_token');
 *   logger.error({ err, steamId }, 'fcm_delete_failed');
 *
 * - Le 1er argument = contexte structuré (objet de champs).
 * - Le 2e argument  = identifiant d'événement en snake_case (recherchable).
 * - Pour attacher un `err` pino le sérialise automatiquement (stack, code)
 *   et le logger relaye `err` à Sentry via captureException.
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || 'info';
const sentryEnabled = Boolean(process.env.SENTRY_DSN);

// Le module @sentry/node est déjà chargé par `./instrument` au boot du serveur.
// On le récupère via require : si Sentry n'a pas été init (DSN absent), les
// appels captureException/addBreadcrumb sont no-op → aucun effet de bord.
const Sentry = sentryEnabled ? require('@sentry/node') : null;

// Mapping des niveaux pino (numériques) → niveaux Sentry (strings)
// pino: trace=10, debug=20, info=30, warn=40, error=50, fatal=60
function pinoLevelToSentrySeverity(levelNum) {
  if (levelNum >= 60) return 'fatal';
  if (levelNum >= 50) return 'error';
  if (levelNum >= 40) return 'warning';
  if (levelNum >= 30) return 'info';
  return 'debug';
}

/**
 * Forward un log vers Sentry selon sa sévérité.
 *
 * - warn (40) → breadcrumb (contexte, pas d'alerte)
 * - error (50), fatal (60) → captureException si `err` présent,
 *   sinon captureMessage avec le msg comme titre
 * - info/debug/trace → breadcrumb seulement (utile pour retracer avant une erreur)
 *
 * Note : on limite le volume en ne créant un "event" Sentry QUE pour
 * error/fatal. Les info/warn restent en breadcrumbs pour garder le contexte
 * sans exploser le quota.
 */
function forwardToSentry(obj, msg, levelNum) {
  if (!Sentry) return;

  const severity = pinoLevelToSentrySeverity(levelNum);

  // Extraire l'erreur si présente dans le contexte (convention : `err`)
  const err = obj && obj.err instanceof Error ? obj.err : null;

  // Ajouter un breadcrumb pour toute entrée >= info (trace+debug ignorés pour le bruit)
  if (levelNum >= 30) {
    Sentry.addBreadcrumb({
      category: 'log',
      level: severity,
      message: msg || '(no message)',
      data: obj ? sanitizeForBreadcrumb(obj) : undefined,
    });
  }

  // Créer un vrai event Sentry pour error/fatal uniquement
  if (levelNum >= 50) {
    Sentry.withScope((scope) => {
      scope.setLevel(severity);

      // Attacher le contexte structuré sous un tag "event" pour recherche
      if (msg) scope.setTag('event', msg);

      // Attacher tout le contexte hors `err` en extra data
      if (obj) {
        const extras = sanitizeForBreadcrumb(obj);
        Object.entries(extras).forEach(([k, v]) => scope.setExtra(k, v));
      }

      if (err) {
        Sentry.captureException(err);
      } else {
        Sentry.captureMessage(msg || 'log_error');
      }
    });
  }
}

/**
 * Nettoie l'objet de contexte avant de l'envoyer à Sentry :
 *   - retire la clé `err` (déjà gérée par captureException)
 *   - ne garde que des valeurs scalaires/objets simples (pas de cycles)
 */
function sanitizeForBreadcrumb(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'err') continue;
    if (value === null || value === undefined) continue;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') {
      out[key] = value;
    } else if (t === 'object') {
      try {
        // Tente une sérialisation safe (évite les cycles / gros objets)
        out[key] = JSON.parse(JSON.stringify(value));
      } catch (_) {
        out[key] = '[unserializable]';
      }
    }
  }
  return out;
}

const baseOptions = {
  level: logLevel,
  base: {
    // Évite d'inclure pid/hostname à chaque ligne (bruit inutile sur Railway)
    pid: undefined,
    hostname: undefined,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    // Champs à jamais logger, même par accident
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  hooks: {
    // Intercepte chaque appel logger.xxx(...) AVANT l'écriture sur stdout.
    // On forward à Sentry puis on relaye à la méthode pino standard.
    // Convention pino : inputArgs = [mergingObject?, interpolationValues..., message?]
    // La forme la plus courante dans le code : logger.error({ err, ctx }, 'event')
    logMethod(inputArgs, method, level) {
      if (sentryEnabled && inputArgs.length >= 1) {
        const first = inputArgs[0];
        let contextObj = null;
        let message = null;

        if (typeof first === 'object' && first !== null) {
          contextObj = first;
          message = typeof inputArgs[1] === 'string' ? inputArgs[1] : null;
        } else if (typeof first === 'string') {
          message = first;
        }

        try {
          forwardToSentry(contextObj, message, level);
        } catch (_) {
          // Un bug dans le forward ne doit JAMAIS casser un log.
        }
      }
      return method.apply(this, inputArgs);
    },
  },
};

const devTransport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'HH:MM:ss.l',
    ignore: 'pid,hostname',
    singleLine: false,
  },
};

const logger = pino({
  ...baseOptions,
  ...(isProduction ? {} : { transport: devTransport }),
});

module.exports = logger;
