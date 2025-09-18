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

// Route d'authentification Steam
app.get("/auth/steam/return", async (req, res) => {
  try {
    // Valider la réponse OpenID
    if (!req.query["openid.identity"]) {
      return res.status(400).json({ error: "Réponse OpenID invalide" });
    }

    // Extraire le SteamID de la réponse OpenID
    const identity = req.query["openid.identity"];
    const matches = identity.match(/\/id\/(\d+)$/);

    if (!matches || !matches[1]) {
      return res
        .status(400)
        .json({ error: "SteamID non trouvé dans la réponse" });
    }

    const steamId = matches[1];

    // Enregistrer ou mettre à jour l'utilisateur
    try {
      await steamService.registerOrUpdateUser(steamId);
      console.log(`Utilisateur ${steamId} authentifié avec succès via Steam`);
    } catch (error) {
      console.error("Erreur lors de l'enregistrement de l'utilisateur:", error);
      // On continue malgré l'erreur
    }

    // Rediriger vers l'application mobile avec le SteamID
    res.redirect(`steamnotif://auth?steamId=${steamId}`);
  } catch (error) {
    console.error("Erreur lors de l'authentification Steam:", error);
    res.status(500).json({ error: "Erreur lors de l'authentification" });
  }
});

// Middleware pour vérifier si l'API key est valide
const checkApiKey = (req, res, next) => {
  const apiKey = req.query.key || req.headers["x-api-key"];

  // Permettre les routes d'authentification sans API key
  if (req.path.startsWith("/auth/") || req.path === "/") {
    return next();
  }

  // Vérifier la clé (simple comparaison pour cet exemple)
  if (apiKey && apiKey === process.env.STEAM_API_KEY) {
    return next();
  }

  res.status(401).json({ error: "Clé API non valide ou manquante" });
};

// Appliquer le middleware de vérification d'API key à toutes les routes d'API
app.use("/api", checkApiKey);

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
