const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// Import des routes
const userRoutes = require("./src/routes/users");
const newsRoutes = require("./src/routes/news");
const steamRoutes = require("./src/routes/steam");

// Import du configurateur de tâches planifiées
const cronJobs = require("./src/config/cronJobs");

// Import des services
const steamService = require("./src/services/steamService");
const gamesSyncService = require("./src/services/gamesSyncService");

// Import des utilitaires
const newsChecker = require("./src/utils/newsChecker");

// Modèles
const User = require("./src/models/User");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connecté à MongoDB");

    // Initialiser les tâches planifiées après connexion à la base de données
    cronJobs.initCronJobs();
  })
  .catch((err) => console.error("Erreur de connexion à MongoDB:", err));

// Routes
app.use("/api/users", userRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/steam", steamRoutes);

// Routes de base
app.get("/", (req, res) => {
  res.send("API de notifications Steam opérationnelle !");
});

// Route pour déclencher manuellement une synchronisation (utile pour le développement et les tests)
app.post("/api/admin/sync", async (req, res) => {
  try {
    console.log(
      "Déclenchement manuel de la synchronisation des bibliothèques..."
    );

    // Lancer la synchronisation
    const stats = await gamesSyncService.syncAllUsersGames();

    // Répondre avec les statistiques
    res.json({
      status: "success",
      message: "Synchronisation manuelle terminée avec succès",
      stats,
    });
  } catch (error) {
    console.error("Erreur lors de la synchronisation manuelle:", error);
    res.status(500).json({
      status: "error",
      message: "Erreur lors de la synchronisation manuelle",
      error: error.message,
    });
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
