/**
 * Gestionnaire de connexion à la base de données
 * Centralise la configuration MongoDB et l'initialisation
 */

const mongoose = require("mongoose");
const cronJobs = require("../config/cron");
const { SERVER_CONFIG, SUCCESS_MESSAGES } = require("../config/app");

/**
 * Initialise la connexion à MongoDB
 * Lance les tâches planifiées après connexion réussie
 */
async function connectDatabase() {
  try {
    // Options de connexion pour améliorer la stabilité
    const options = {
      serverSelectionTimeoutMS: 10000, // Timeout de 10 secondes
      socketTimeoutMS: 45000, // Timeout de socket de 45 secondes
      family: 4, // Force l'utilisation d'IPv4 pour éviter les problèmes DNS
    };

    await mongoose.connect(SERVER_CONFIG.MONGODB_URI, options);
    console.log(SUCCESS_MESSAGES.MONGODB_CONNECTED);

    // Initialiser les tâches planifiées après connexion à la base de données
    cronJobs.initCronJobs();

    return true;
  } catch (error) {
    console.error("Erreur de connexion à MongoDB:", error);
    throw error;
  }
}

/**
 * Ferme proprement la connexion à la base de données
 */
async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    console.log("Connexion MongoDB fermée");
  } catch (error) {
    console.error("Erreur lors de la fermeture de MongoDB:", error);
  }
}

/**
 * Gère l'arrêt propre de l'application
 */
function setupGracefulShutdown() {
  const gracefulShutdown = async (signal) => {
    console.log(`Signal ${signal} reçu, arrêt en cours...`);
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  setupGracefulShutdown,
};
