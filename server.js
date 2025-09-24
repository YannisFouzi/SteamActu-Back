/**
 * Serveur principal de l'API Steam Notifications
 * Architecture modulaire avec séparation des responsabilités
 */

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
const { checkApiKey } = require("./src/middleware/auth");

// Import des routes
const userRoutes = require("./src/routes/users");
const newsRoutes = require("./src/routes/news");
const steamRoutes = require("./src/routes/steam");
const authRoutes = require("./src/routes/auth");

const app = express();

// Middleware globaux
app.use(cors(CORS_OPTIONS));
app.use(express.json());

// Route racine
app.get("/", (req, res) => {
  res.send(SUCCESS_MESSAGES.API_OPERATIONAL);
});

// Routes d'authentification (publiques)
app.use("/auth", authRoutes);

// Middleware d'authentification pour les routes API (désactivé pour l'app mobile)
// app.use("/api", checkApiKey);

// Routes API (protégées)
app.use("/api/users", userRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/steam", steamRoutes);

/**
 * Initialisation et démarrage du serveur
 */
async function startServer() {
  try {
    // Connexion à la base de données
    await connectDatabase();

    // Configuration de l'arrêt propre
    setupGracefulShutdown();

    // Démarrage du serveur
    app.listen(SERVER_CONFIG.PORT, () => {
      console.log(SUCCESS_MESSAGES.SERVER_STARTED(SERVER_CONFIG.PORT));
    });
  } catch (error) {
    console.error("Erreur lors du démarrage du serveur:", error);
    process.exit(1);
  }
}

// Lancement du serveur
startServer();
