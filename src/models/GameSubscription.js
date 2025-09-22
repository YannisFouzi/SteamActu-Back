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
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Index composé pour optimiser les requêtes
GameSubscriptionSchema.index({ gameId: 1, subscribers: 1 });

// Middleware pour mettre à jour updatedAt
GameSubscriptionSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("GameSubscription", GameSubscriptionSchema);
