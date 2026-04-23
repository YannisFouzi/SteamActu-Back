/**
 * Gestionnaire de connexion a la base de donnees
 * Centralise la configuration MongoDB et l'initialisation
 */

const mongoose = require('mongoose');
const { DATABASE_CONFIG, SUCCESS_MESSAGES } = require('../config/app');
const UserNewsState = require('../models/UserNewsState');
const GameSubscription = require('../models/GameSubscription');
const { stopAgenda } = require('../config/cron');

/**
 * Initialise la connexion a MongoDB
 */
async function connectDatabase() {
  try {
    await mongoose.connect(DATABASE_CONFIG.uri, DATABASE_CONFIG.options);
    console.log(SUCCESS_MESSAGES.MONGODB_CONNECTED);

    // Sync indexes pour les modèles dont les contraintes ont évolué
    // (ajout de `unique` ou TTL qu'il faut appliquer sur la collection existante).
    await UserNewsState.syncIndexes();
    await GameSubscription.syncIndexes();

    return true;
  } catch (error) {
    const safeMessage =
      error && error.message ? error.message : 'MongoDB connection failed';
    console.error('Erreur connexion MongoDB:', safeMessage);
    throw error;
  }
}

/**
 * Ferme proprement la connexion MongoDB
 */
async function disconnectDatabase() {
  try {
    await mongoose.disconnect();
    console.log('Connexion MongoDB fermee');
  } catch (error) {
    const safeMessage =
      error && error.message ? error.message : 'MongoDB disconnect failed';
    console.error('Erreur fermeture MongoDB:', safeMessage);
  }
}

/**
 * Gere l'arret propre de l'application
 */
function setupGracefulShutdown() {
  const gracefulShutdown = async (signal) => {
    console.log(`Signal ${signal} recu, arret en cours...`);
    // Arrêter Agenda AVANT Mongo : les jobs en cours doivent pouvoir libérer
    // leurs locks (`lockedAt`) et marquer `lastFinishedAt`, ce qui nécessite
    // une connexion MongoDB active.
    await stopAgenda();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  setupGracefulShutdown,
};
