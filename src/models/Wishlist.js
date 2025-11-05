const mongoose = require("mongoose");

/**
 * Schéma pour les jeux wishlistés - VERSION MINIMALISTE
 *
 * PHILOSOPHIE :
 * - Même logique que Games : table de référence MINIMALE
 * - Métadonnées communes partagées entre tous les users
 * - Pas de doublon : un jeu wishlisté = un document, partagé par N users
 * - User.wishlist.gameIds[] contient les références vers cette collection
 *
 * POURQUOI MINIMALISTE ?
 * - Évite doublons (Battlefield 6 wishlisted par 100 users = 1 document, pas 100)
 * - Léger et rapide
 * - Cohérent avec Games
 *
 * Date : 2025-11-04
 */

const WishlistSchema = new mongoose.Schema({
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
    default: "",
  },
});

module.exports = mongoose.model("Wishlist", WishlistSchema);
