const mongoose = require('mongoose');

/**
 * Schéma pour les jeux Steam
 *
 * PHILOSOPHIE :
 * - Cette collection sert UNIQUEMENT de table de référence pour les crons
 * - Les données user-specific (playtime, lastPlayed) sont récupérées via Steam API à la demande
 * - Les filtres/tris sont faits via Steam API direct (pas en BDD)
 *
 * POURQUOI MINIMALISTE ?
 * - Évite conflits entre users (pas de données user-specific)
 * - Évite doublons (un jeu = un document, partagé par tous les users)
 * - Léger et rapide
 *
 */

const GameSchema = new mongoose.Schema({
  appId: {
    type: String,
    required: true,
    unique: true,
    index: true, // Index pour lookups rapides
  },
  name: {
    type: String,
    required: true,
  },
  img_icon_url: {
    type: String,
    default: '',
  },
  header_image: {
    type: String,
    default: '',
  },
});

module.exports = mongoose.model('Game', GameSchema);
