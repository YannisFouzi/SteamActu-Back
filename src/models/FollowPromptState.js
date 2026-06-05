const mongoose = require('mongoose');

// Cross-surface ledger for the "nouveau jeu détecté → clic pour suivre"
// (follow_prompt) notification. One row per (user, game). Mirrors the role
// UserNewsState plays for news: it lets the mobile cron and the Steam Desktop
// plugin avoid prompting the same game twice across devices.
//
// No TTL: a follow-prompt stays relevant until the user follows the game, and
// the row count is bounded by the user's library/wishlist size.
const FollowPromptStateSchema = new mongoose.Schema(
  {
    steamId: {
      type: String,
      required: true,
    },
    appId: {
      type: String,
      required: true,
    },
    // Mobile FCM follow-prompt delivered.
    pushedAt: {
      type: Date,
      default: null,
    },
    // Steam Desktop (Millennium plugin) follow-prompt toast delivered.
    toastedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

FollowPromptStateSchema.index({ steamId: 1, appId: 1 }, { unique: true });

module.exports = mongoose.model('FollowPromptState', FollowPromptStateSchema);
