import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import { isEmbedded } from './host';
import './styles.css';

// Quel hôte affiche le SPA ? (site / iframe plugin / iframe extension) — partagé
// par Sentry (tag) et l'analytics (dimension surface), via le helper host.ts.
export function detectSurface(): string {
  if (!isEmbedded()) {
    return 'web-standalone';
  }
  try {
    const ref = document.referrer || '';
    if (ref.includes('steamloopback.host')) return 'plugin-iframe';
    if (ref.includes('steam')) return 'extension-iframe';
  } catch {
    /* parent cross-origin */
  }
  return 'embedded-unknown';
}

// Monitoring d'erreurs — gardé par VITE_SENTRY_DSN (no-op tant que la clé n'est
// pas posée au build, comme l'init backend/mobile). Errors-only pour démarrer
// (pas de tracing perf → quota mini). Voir SENTRY_SETUP.md.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  Sentry.setTag('surface', detectSurface());
}

// Analytics d'audience (Umami, cookieless) — gardé par VITE_UMAMI_* (no-op +
// tree-shaké sans clé). Le script auto-collecte pages vues + pays + référents ;
// les events d'usage viendront ensuite (voir ANALYTICS_SETUP.md).
const umamiId = import.meta.env.VITE_UMAMI_WEBSITE_ID;
const umamiSrc = import.meta.env.VITE_UMAMI_SRC;
if (umamiId && umamiSrc && import.meta.env.PROD) {
  const s = document.createElement('script');
  s.defer = true;
  s.src = umamiSrc;
  s.setAttribute('data-website-id', umamiId);
  document.head.appendChild(s);
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
