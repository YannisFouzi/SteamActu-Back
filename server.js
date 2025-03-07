const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cron = require("node-cron");
require("dotenv").config();

// Import des routes
const userRoutes = require("./src/routes/users");
const newsRoutes = require("./src/routes/news");
const steamRoutes = require("./src/routes/steam");

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
  .then(() => console.log("Connecté à MongoDB"))
  .catch((err) => console.error("Erreur de connexion à MongoDB:", err));

// Routes
app.use("/api/users", userRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/steam", steamRoutes);

// Routes de base
app.get("/", (req, res) => {
  res.send("API de notifications Steam opérationnelle !");
});

// Tâche cron pour vérifier les nouvelles actualités (toutes les 10 minutes)
cron.schedule("*/10 * * * *", async () => {
  console.log("Vérification des nouvelles actualités Steam...");

  try {
    await newsChecker.checkNewsForAllUsers();
  } catch (error) {
    console.error("Erreur lors de la vérification des actualités:", error);
  }
});

// Tâche cron pour synchroniser les bibliothèques de jeux (tous les jours à minuit)
cron.schedule("0 0 * * *", async () => {
  console.log(
    "Démarrage de la synchronisation quotidienne des bibliothèques de jeux..."
  );

  try {
    const stats = await gamesSyncService.syncAllUsersGames();
    console.log("Synchronisation quotidienne terminée avec succès:", stats);
  } catch (error) {
    console.error(
      "Erreur lors de la synchronisation quotidienne des bibliothèques:",
      error
    );
  }
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
