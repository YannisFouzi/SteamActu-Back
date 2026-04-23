/**
 * Logger structuré basé sur pino.
 *
 * Format :
 *   - En dev  (NODE_ENV !== 'production') : pretty-print coloré via pino-pretty
 *   - En prod : JSON brut (une ligne = un objet) → ingéré directement par
 *     Railway / Datadog / Sentry breadcrumbs sans parsing supplémentaire
 *
 * Niveau par défaut : 'info' (surcharge possible via `LOG_LEVEL=debug` en env)
 *
 * Convention d'usage :
 *   logger.info({ steamId, appId }, 'fcm_token_added');
 *   logger.warn({ errorCode }, 'firebase_invalid_token');
 *   logger.error({ err, steamId }, 'fcm_delete_failed');
 *
 * - Le 1er argument = contexte structuré (objet de champs).
 * - Le 2e argument  = identifiant d'événement en snake_case (recherchable).
 * - Pour attacher un `err` pino le sérialise automatiquement (stack, code).
 *
 * Pour logger avec un contexte persistant (ex. dans un job cron) :
 *   const log = logger.child({ task: 'news-check', runId });
 *   log.info('started');
 *   log.error({ err }, 'failed');
 */

const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || 'info';

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
