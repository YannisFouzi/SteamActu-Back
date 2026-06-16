/// <reference types="vite/client" />

// Variables d'environnement Vite (préfixe VITE_, exposées au bundle). Toutes
// PUBLIQUES par nature — un DSN Sentry est une clé cliente, pas un secret.
interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_RELEASE?: string;
  // Analytics Umami (cookieless). website-id = UUID public, src = URL du script.
  readonly VITE_UMAMI_WEBSITE_ID?: string;
  readonly VITE_UMAMI_SRC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
