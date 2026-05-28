const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  steamId: {
    type: String,
    required: true,
    unique: true,
  },
  language: {
    type: String,
    enum: ['fr', 'en', 'de', 'es', 'ru', 'zh'],
    default: 'fr',
  },
  lastChecked: {
    type: Date,
    default: null, // null permet sync immédiate pour nouveaux users
  },
  followedGames: {
    type: [
      {
        appId: {
          type: String,
          required: true,
        },
        followedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    validate: {
      validator: function (v) {
        return v.length <= 500;
      },
      message: 'Vous ne pouvez suivre plus de 500 jeux',
    },
  },
  recentActiveGames: {
    type: [
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
    validate: {
      validator: function (v) {
        return v.length <= 200;
      },
      message: 'Maximum 200 jeux actifs récents',
    },
  },

  notificationSettings: {
    newsNotifications: {
      type: Boolean,
      default: false,
    },
    // Toasts d'actualites dans le client Steam Desktop (plugin Millennium).
    // Independant de newsNotifications (= push FCM mobile). Defaut true :
    // l'utilisateur a installe le plugin volontairement (opt-out).
    steamNotifications: {
      type: Boolean,
      default: true,
    },
    followPromptNotifications: {
      type: Boolean,
      default: false,
    },
    fcmTokens: [
      {
        token: {
          type: String,
          required: true,
        },
        platform: {
          type: String,
          enum: ['android', 'ios', 'web'],
          required: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    /**
     * Modes de suivi automatique
     * - off: aucun ajout automatique
     * - auto: ajout direct aux jeux suivis
     * - prompt: envoi d'une notification de confirmation
     */
    libraryFollowMode: {
      type: String,
      enum: ['off', 'auto', 'prompt'],
      default: 'off',
    },
    wishlistFollowMode: {
      type: String,
      enum: ['off', 'auto', 'prompt'],
      default: 'off',
    },
    /** Si true : dialog de confirmation avant désuivi manuel (cloche). */
    confirmUnfollowGames: {
      type: Boolean,
      default: true,
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
          default: null,
        },
        playtime_2weeks: {
          type: Number,
          default: 0,
        },
        hasPlaytimeData: {
          type: Boolean,
          default: false,
        },
        // Jeu accessible via Steam Family (non possédé), détecté via le diff
        // GetRecentlyPlayedGames ∖ GetOwnedGames. Persistant : conservé entre
        // syncs même si le jeu sort de la fenêtre 2 semaines.
        isFamilyShared: {
          type: Boolean,
          default: false,
        },
      },
    ],
    lastFullSync: {
      type: Date,
      default: null,
    },
  },

  /**
   * Wishlist
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

  /**
   * Versioning pour invalidation cache frontend
   * - gamesVersion : mise à jour à chaque sync de la bibliothèque ou follow/unfollow
   * - wishlistVersion : mise à jour à chaque sync de la wishlist
   * Permet au frontend de détecter les changements sans télécharger toutes les données
   */
  gamesVersion: {
    type: Date,
    default: null,
  },
  wishlistVersion: {
    type: Date,
    default: null,
  },
  newsFavorites: [
    {
      appId: {
        type: String,
        required: true,
      },
      newsId: {
        type: String,
        required: true,
      },
      newsDate: {
        type: Date,
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
  lastNewsFeedSeenAt: {
    type: Date,
    default: null,
  },
});

// Note: Index sur steamId déjà créé automatiquement par l'option "unique: true"

// Serialisation API : followedGames est exposé en array d'appIds (strings) pour
// conserver le contrat frontend historique. Le champ followedAt reste interne
// à Mongo ; il est explicitement ré-exposé par getFollowedGamesDetailsBySteamId
// quand l'UI en a besoin (tri "Récents" dans l'onglet Jeux suivis).
UserSchema.set('toJSON', {
  transform(doc, ret) {
    if (Array.isArray(ret.followedGames)) {
      ret.followedGames = ret.followedGames
        .map((entry) =>
          entry && typeof entry === 'object' && entry.appId
            ? String(entry.appId)
            : typeof entry === 'string'
            ? entry
            : null
        )
        .filter(Boolean);
    }
    return ret;
  },
});

module.exports = mongoose.model('User', UserSchema);
