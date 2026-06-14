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
        // Suivi à deux niveaux : true = news dans le fil + push/toast (cloche),
        // false = "suivi silencieux", news dans le fil SEULEMENT (bouton +).
        // Les entrées existantes n'ont pas le champ → traitées comme true
        // partout (les filtres ne matchent que notifications === false).
        notifications: {
          type: Boolean,
          default: true,
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
    // Opt-in : si Steam Desktop est ouvert (heartbeat recent), ne PAS envoyer
    // le push FCM mobile (le toast Steam le couvre) -> evite les doublons.
    preferSteamWhenOpen: {
      type: Boolean,
      default: false,
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

  // Heartbeat du plugin Millennium : derniere fois ou Steam Desktop a ete vu
  // ouvert. Utilise par la dedup de notifs (preferSteamWhenOpen).
  lastSteamSeenAt: {
    type: Date,
    default: null,
  },

  // Premiere fois ou le plugin a demande ses toasts desktop. Sert de "seed" :
  // au 1er appel, on marque toutes les news courantes comme deja servies (sans
  // toaster) pour ne pas spammer le backlog existant, exactement comme l'ancien
  // seed localStorage du plugin -- mais cote serveur, source de verite unique.
  desktopToastSeededAt: {
    type: Date,
    default: null,
  },

  // Idem mais pour les follow-prompts desktop (cf. FollowPromptState). Au 1er
  // appel du plugin, on marque tous les jeux non-suivis courants comme deja
  // proposes (sans toaster) pour ne pas spammer le backlog.
  followPromptSeededAt: {
    type: Date,
    default: null,
  },

  // Secret d'appairage par-installation du plugin Millennium (TOFU). Le plugin
  // genere un secret aleatoire au 1er lancement et l'enregistre une fois via
  // GET /api/web/pair. Tant que ce champ est null, la surface /api/web reste
  // publique-par-SteamID (compat); des qu'un secret est pose, les lectures
  // sensibles (profile/library/news) exigent le header X-GN-Secret correspondant
  // -> le feed n'est plus consultable publiquement avec la seule URL.
  // On stocke un hash SHA-256 (jamais le secret en clair).
  webPairSecretHash: {
    type: String,
    default: null,
    select: false,
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
   * Versioning pour invalidation cache frontend (le client sonde GET /steam/status
   * et ne re-fetch que ce qui a changé) :
   * - gamesVersion : sync de la BIBLIOTHÈQUE (jeux possédés). Un follow ne la
   *   bumpe PAS (sinon rechargement complet des 250 jeux au focus = lag).
   * - wishlistVersion : sync de la wishlist.
   * - followVersion : suivi (follow/unfollow/toggle notifications), sur N'IMPORTE
   *   quelle surface (mobile, web, plugin, extension). Déclenche un re-fetch du
   *   PROFIL SEUL côté mobile → propage les follows cross-device sans recharger
   *   la bibliothèque.
   */
  gamesVersion: {
    type: Date,
    default: null,
  },
  wishlistVersion: {
    type: Date,
    default: null,
  },
  followVersion: {
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
      // mutedGames (suivi silencieux, bouton +) : dérivé AVANT l'aplatissement
      // de followedGames en strings — c'est la seule source per-game du flag
      // notifications pour l'app mobile (champ additif, contrat préservé).
      ret.mutedGames = ret.followedGames
        .filter(
          (entry) =>
            entry &&
            typeof entry === 'object' &&
            entry.appId &&
            entry.notifications === false
        )
        .map((entry) => String(entry.appId));
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
