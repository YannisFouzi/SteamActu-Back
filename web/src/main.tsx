import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import { isEmbedded } from './host';
import './styles.css';

// Monitoring d'erreurs — gardé par VITE_SENTRY_DSN (no-op tant que la clé n'est
// pas posée au build, comme l'init backend/mobile). Errors-only pour démarrer
// (pas de tracing perf → quota mini). Ce SPA s'affiche dans 3 hôtes (site,
// iframe plugin, iframe extension) → on tague la surface pour segmenter. Voir
// SENTRY_SETUP.md.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });

  let surface = 'web-standalone';
  if (isEmbedded()) {
    try {
      const ref = document.referrer || '';
      surface = ref.includes('steamloopback.host')
        ? 'plugin-iframe'
        : ref.includes('steam')
          ? 'extension-iframe'
          : 'embedded-unknown';
    } catch {
      surface = 'embedded-unknown';
    }
  }
  Sentry.setTag('surface', surface);
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root not found');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
