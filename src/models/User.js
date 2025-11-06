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
    default: null, // null permet sync immédiate pour nouveaux users
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
    autoFollowWishlistGames: {
      type: Boolean,
      default: false,
    },
  },

  gameLibrary: {
    games: [
      {
        gameId: {
          type: String,
          required: true,
        },
        playtime_forever: {
          type: Number,
          default: 0,
        },
        rtime_last_played: {
          type: Number,
          default: 0,
        },
        playtime_2weeks: {
          type: Number,
          default: 0,
        },
      },
    ],
    lastFullSync: {
      type: Date,
      default: null,
    },
  },

  /**
   * Wishlist - VERSION FINALE (2025-11-05)
   * games[] contient références + métadonnées user-specific (date_added)
   * Collection Wishlist centrale pour métadonnées communes (name, img)
   */
  wishlist: {
    games: [
      {
        gameId: {
          type: String,
          required: true,
        },
        date_added: {
          type: Number,
          default: 0,
        },
        priority: {
          type: Number,
          default: 0,
        },
      },
    ],
    lastFullSync: {
      type: Date,
      default: null,
    },
  },
});

// Note: Index sur steamId déjà créé automatiquement par l'option "unique: true"

module.exports = mongoose.model("User", UserSchema);
