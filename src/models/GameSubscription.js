const mongoose = require("mongoose");

const GameSubscriptionSchema = new mongoose.Schema({
  gameId: {
    type: String,
    required: true,
    index: true, // Index pour performances
  },
  name: {
    type: String,
    required: true,
  },
  subscribers: [
    {
      type: String, // steamId des utilisateurs
      required: true,
    },
  ],
  lastNewsTimestamp: {
    type: Number,
    default: 0,
  },
  lastNewsCheck: {
    type: Date,
    default: null, // Date de la dernière vérification des news (pour rotation)
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index pour améliorer les performances de la rotation
GameSubscriptionSchema.index({ lastNewsCheck: 1 });

// Middleware pour mettre à jour updatedAt
GameSubscriptionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("GameSubscription", GameSubscriptionSchema);
