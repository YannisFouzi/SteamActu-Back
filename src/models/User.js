const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  steamId: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
  },
  avatarUrl: {
    type: String,
  },
  lastChecked: {
    type: Date,
    default: Date.now,
  },
  followedGames: [
    {
      type: String, // Juste les appIds (structure ultra-simplifiée)
    },
  ],
  recentActiveGames: [
    {
      appId: {
        type: String,
      },
      name: {
        type: String,
      },
      lastNewsDate: {
        type: Date,
      },
    },
  ],

  notificationSettings: {
    enabled: {
      type: Boolean,
      default: true,
    },
    pushToken: {
      type: String,
    },
    autoFollowNewGames: {
      type: Boolean,
      default: false,
    },
  },

  // Synchronisation de la wishlist Steam
  wishlistLastSync: {
    timestamp: {
      type: Number,
      default: 0, // Timestamp du dernier jeu wishlisté vérifié
    },
    lastSyncDate: {
      type: Date,
      default: null, // Date de la dernière synchronisation
    },
  },

  // Cache de la bibliothèque de jeux Steam
  gameLibrary: {
    games: [
      {
        appId: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        playtime_forever: {
          type: Number,
          default: 0,
        },
        playtime_2weeks: {
          type: Number,
          default: 0,
        },
        rtime_last_played: {
          type: Number,
          default: 0,
        },
        img_icon_url: {
          type: String,
        },
        firstSeenDate: {
          type: Date,
          default: Date.now, // Date où nous avons détecté ce jeu
        },
      },
    ],
    lastFullSync: {
      type: Date,
      default: null, // Dernière synchronisation complète
    },
    gamesCount: {
      type: Number,
      default: 0, // Nombre total de jeux pour détection rapide
    },
  },
});

// Note: Index sur steamId déjà créé automatiquement par l'option "unique: true"

module.exports = mongoose.model("User", UserSchema);
