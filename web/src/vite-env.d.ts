/// <reference types="vite/client" />

// Variables d'environnement Vite (préfixe VITE_, exposées au bundle). Toutes
// PUBLIQUES par nature — un DSN Sentry est une clé cliente, pas un secret.
interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
