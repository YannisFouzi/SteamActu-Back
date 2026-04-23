/**
 * Serveur principal de l'API Steam Notifications
 * Architecture modulaire avec separation des responsabilites
 */

// Sentry DOIT etre require() en premier (auto-instrumentation OpenTelemetry)
require("./instrument");

const Sentry = require("@sentry/node");
const express = require("express");
const cors = require("cors");

// Configuration et utilitaires
const {
  SERVER_CONFIG,
  CORS_OPTIONS,
  SUCCESS_MESSAGES,
} = require("./src/config/app");
const {
  connectDatabase,
  setupGracefulShutdown,
} = require("./src/database/connection");
const { initAgenda } = require("./src/config/cron");

// Import des routes
const userRoutes = require("./src/routes/users");
const newsRoutes = require("./src/routes/news");
const steamRoutes = require("./src/routes/steam");
const authRoutes = require("./src/routes/auth");
const adminRoutes = require("./src/routes/admin");
const adminAuth = require("./src/middleware/adminAuth");
const {
  steamLimiter,
  authLimiter,
  apiLimiter,
  adminLimiter,
} = require("./src/middleware/rateLimiter");

const app = express();

// Trust proxy pour HTTPS derriere Railway/reverse proxy
app.set("trust proxy", 1);

// Middleware globaux
app.use(cors(CORS_OPTIONS));
app.use(express.json());

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

// Routes admin (protegees par Bearer token via ADMIN_TOKEN)
app.use("/admin", adminLimiter, adminAuth, adminRoutes);

// Routes debug (dev uniquement)
if (SERVER_CONFIG.NODE_ENV === "development") {
  const debugRoutes = require("./src/routes/debug");
  app.use("/api/debug", debugRoutes);
  console.log("[DEBUG] Routes /api/debug activées (dev only)");
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
      console.log(SUCCESS_MESSAGES.SERVER_STARTED(SERVER_CONFIG.PORT));
    });
  } catch (error) {
    const safeMessage =
      error && error.message ? error.message : "Server start failed";
    console.error("Erreur demarrage serveur:", safeMessage);
    process.exit(1);
  }
}

// Lancement du serveur
startServer();
