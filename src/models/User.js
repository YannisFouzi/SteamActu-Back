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
      appId: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      logoUrl: {
        type: String,
      },
      lastNewsTimestamp: {
        type: Number,
        default: 0,
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
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", UserSchema);
