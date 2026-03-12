const mongoose = require('mongoose');

const UserNewsStateSchema = new mongoose.Schema(
  {
    steamId: {
      type: String,
      required: true,
    },
    appId: {
      type: String,
      required: true,
    },
    newsId: {
      type: String,
      required: true,
    },
    inFeedAt: {
      type: Date,
      default: null,
    },
    pushSentAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// Clé unique : un seul état par user + jeu + news
UserNewsStateSchema.index({ steamId: 1, appId: 1, newsId: 1 }, { unique: true });

// TTL : nettoyage automatique après expiration (90 jours par défaut)
UserNewsStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('UserNewsState', UserNewsStateSchema);
