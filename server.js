/**
 * Serveur principal de l'API Steam Notifications
 * Architecture modulaire avec separation des responsabilites
 */

// Charge .env ICI (et non via instrument.js) pour pouvoir lire des env vars
// avant le bootstrap Sentry. `dotenv.config()` est idempotent — l'appel
// suivant dans instrument.js est un no-op pour les cles deja definies.
require("dotenv").config();

// Override optionnel des serveurs DNS utilises par Node (c-ares) avant TOUT
// require qui pourrait declencher une resolution. Utile en dev quand le
// resolver local (VPN, antivirus, DNS d'entreprise) refuse les requetes SRV
// `mongodb+srv://` avec ECONNREFUSED. Aucune incidence en prod si l'env var
// n'est pas definie. Format : "1.1.1.1,8.8.8.8".
if (process.env.BACKEND_DNS_SERVERS) {
  const servers = process.env.BACKEND_DNS_SERVERS
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (servers.length > 0) {
    require("dns").setServers(servers);
  }
}

// Sentry DOIT etre require() en premier (auto-instrumentation OpenTelemetry)
require("./instrument");

const Sentry = require("@sentry/node");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

// Configuration et utilitaires
const {
  SERVER_CONFIG,
  SECURITY_CONFIG,
  CORS_OPTIONS,
  SUCCESS_MESSAGES,
} = require("./src/config/app");
const {
  connectDatabase,
  setupGracefulShutdown,
} = require("./src/database/connection");
const { initAgenda } = require("./src/config/cron");
const logger = require("./src/utils/logger");

// Import des routes
const userRoutes = require("./src/routes/users");
const newsRoutes = require("./src/routes/news");
const steamRoutes = require("./src/routes/steam");
const authRoutes = require("./src/routes/auth");
const feedbackRoutes = require("./src/routes/feedback");
const adminRoutes = require("./src/routes/admin");
const mobileAdminRoutes = require("./src/routes/mobileAdmin");
const healthRoutes = require("./src/routes/health");
const versionRoutes = require("./src/routes/version");
const legalRoutes = require("./src/routes/legal");
const feedPageRoutes = require("./src/routes/feedPage");
const webApiRoutes = require("./src/routes/webApi");
const {
  steamLimiter,
  authLimiter,
  apiLimiter,
  adminLimiter,
  feedbackLimiter,
} = require("./src/middleware/rateLimiter");

const app = express();

// Trust proxy pour HTTPS derriere Railway/reverse proxy
app.set("trust proxy", 1);

// Middleware globaux
// helmet pose les headers de securite par defaut (HSTS, X-Content-Type-Options,
// X-Frame-Options, X-DNS-Prefetch-Control, etc.).
// `contentSecurityPolicy: false` : la route /admin a sa propre CSP nonce-based
// strictement plus restrictive ; helmet's default CSP casserait le dashboard.
// Pour les autres routes (API JSON), la CSP est inutile (pas de rendu HTML).
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(CORS_OPTIONS));
// Body limit pinne a 100kb : default Express, on l'explicite pour eviter
// qu'un upgrade silencieux change la valeur. Nos plus gros payloads (tokens
// FCM ~200 chars, listes de jeux) tiennent largement dedans.
app.use(express.json({ limit: "100kb" }));
// cookie-parser pour les routes /admin (session signee). Pas global pour
// limiter la surface d'attaque ; monte juste avant le router admin.
if (SECURITY_CONFIG.ADMIN_SESSION_SECRET) {
  app.use("/admin", cookieParser(SECURITY_CONFIG.ADMIN_SESSION_SECRET));
}

// Route racine
app.get("/", (req, res) => {
  res.send(SUCCESS_MESSAGES.API_OPERATIONAL);
});

// Healthcheck (Railway/k8s) — pas de rate-limit, pas d'auth
app.use("/healthz", healthRoutes);

// Pages legales publiques (Play Store / RGPD) — pas de rate-limit, pas d'auth
// URLs stables a soumettre sur Play Console et a ne JAMAIS bouger
app.use("/", legalRoutes);

// Vue web publique du feed (GET /feed/:steamId) — affichee plein ecran dans
// Steam Desktop via Millennium + accessible dans tout navigateur. Pas d'auth.
// Les assets buildes du SPA sont servis sous /feed-app (base Vite).
app.use(
  "/feed-app",
  express.static(require("path").join(__dirname, "src", "views", "feed-app")),
);
app.use("/", feedPageRoutes);

// Routes d'authentification (publiques)
app.use("/auth", authLimiter, authRoutes);

// Endpoint version (public, pas d'auth — l'app non-authentifiee doit pouvoir
// verifier qu'elle n'est pas trop vieille avant meme de tenter le login)
app.use("/api/version", apiLimiter, versionRoutes);

// Routes API (publiques pour l'app mobile)
app.use("/api/users", apiLimiter, userRoutes);
app.use("/api/news", apiLimiter, newsRoutes);
app.use("/api/web", apiLimiter, webApiRoutes);
app.use("/api/steam", steamLimiter, steamRoutes);
app.use("/api/feedback", feedbackLimiter, feedbackRoutes);
app.use("/api/admin", adminLimiter, mobileAdminRoutes);

// Routes admin (dashboard UI + API JSON). L'auth est appliquee par route
// dans le router (certaines sont publiques : GET /, POST /login, POST /logout).
app.use("/admin", adminLimiter, adminRoutes);

// Routes debug (dev uniquement)
if (SERVER_CONFIG.NODE_ENV === "development") {
  const debugRoutes = require("./src/routes/debug");
  app.use("/api/debug", debugRoutes);
  logger.info("debug_routes_enabled");
}

// Sentry error handler DOIT etre avant le errorHandler custom
Sentry.setupExpressErrorHandler(app);

// Catch-all 404 JSON : repond une 404 structuree (et non le HTML par defaut
// d'Express) pour toute route non matchee. A monter APRES tous les routers
// mais AVANT errorHandler.
app.use((req, res) => {
  res.status(404).json({ message: "Not Found", path: req.originalUrl });
});

// Middleware global de gestion des erreurs (doit rester en dernier)
const errorHandler = require("./src/middleware/errorHandler");
app.use(errorHandler);

/**
 * Initialisation et demarrage du serveur
 */
async function startServer() {
  try {
    await connectDatabase();
    await initAgenda();
    setupGracefulShutdown();

    const server = app.listen(SERVER_CONFIG.PORT, () => {
      logger.info({ port: SERVER_CONFIG.PORT }, "server_started");
    });

    // Mitigation slow-loris : ferme les connexions HTTP qui prennent trop de
    // temps a envoyer leurs headers ou leur body. Defaults Node 18 : header=60s,
    // request=300s — trop generaux pour une API publique. On serre.
    // headersTimeout > requestTimeout sinon Node throw au boot.
    server.requestTimeout = 30_000; // 30s pour body complet
    server.headersTimeout = 35_000; // 35s pour headers (doit etre > requestTimeout)
    server.keepAliveTimeout = 65_000; // > 60s default Railway/ALB pour eviter race
  } catch (error) {
    logger.fatal({ err: error }, "server_start_failed");
    process.exit(1);
  }
}

// Lancement du serveur
startServer();
