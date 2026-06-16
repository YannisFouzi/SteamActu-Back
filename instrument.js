/**
 * Init Sentry — DOIT etre require() en tout premier dans server.js,
 * avant tout autre import. Raison: Sentry v10 utilise OpenTelemetry pour
 * instrumenter http/express/mongo au require-time. Si Sentry.init est appele
 * apres le require de ces modules, l'auto-instrumentation est perdue.
 *
 * Si SENTRY_DSN n'est pas defini, Sentry ne s'initialise pas — l'app
 * tourne normalement (utile en dev local).
 */

require('dotenv').config();

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  const Sentry = require('@sentry/node');

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    // Tag de release pour grouper les erreurs par déploiement. Railway injecte
    // automatiquement RAILWAY_GIT_COMMIT_SHA → fallback direct, pas besoin de
    // poser SENTRY_RELEASE à la main (et évite le piège `$VAR` non-expansée).
    release:
      process.env.SENTRY_RELEASE ||
      process.env.RAILWAY_GIT_COMMIT_SHA ||
      undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    // false : ne pas transmettre IP / headers / cookies des utilisateurs a Sentry.
    // Aligne avec l'extension, le SPA web et la politique de confidentialite.
    sendDefaultPii: false,
  });

  console.log('[Sentry] Initialise (env:', process.env.NODE_ENV || 'development', ')');
} else {
  console.log('[Sentry] Desactive (SENTRY_DSN non defini)');
}
