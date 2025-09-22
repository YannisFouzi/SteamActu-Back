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
  // lastSyncedGames supprimé - plus besoin de stocker tous les jeux Steam
});

module.exports = mongoose.model("User", UserSchema);
