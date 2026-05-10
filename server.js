/**
 * Serveur principal de l'API Steam Notifications
 * Architecture modulaire avec separation des responsabilites
 */

// Sentry DOIT etre require() en premier (auto-instrumentation OpenTelemetry)
require("./instrument");

const Sentry = require("@sentry/node");
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

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
app.use(cors(CORS_OPTIONS));
app.use(express.json());
// cookie-parser pour les routes /admin (session signee). Pas global pour
// limiter la surface d'attaque ; monte juste avant le router admin.
if (SECURITY_CONFIG.ADMIN_SESSION_SECRET) {
  app.use("/admin", cookieParser(SECURITY_CONFIG.ADMIN_SESSION_SECRET));
}

// Route racine
app.get("/", (req, res) => {
  res.send(SUCCESS_MESSAGES.API_OPERATIONAL);
});

// Routes d'authentification (publiques)
app.use("/auth", authLimiter, authRoutes);

// Routes API (publiques pour l'app mobile)
app.use("/api/users", apiLimiter, userRoutes);
app.use("/api/news", apiLimiter, newsRoutes);
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

    app.listen(SERVER_CONFIG.PORT, () => {
      logger.info({ port: SERVER_CONFIG.PORT }, "server_started");
    });
  } catch (error) {
    logger.fatal({ err: error }, "server_start_failed");
    process.exit(1);
  }
}

// Lancement du serveur
startServer();
