const mongoose = require('mongoose');

const User = require('../../src/models/User');
const GameSubscription = require('../../src/models/GameSubscription');
const UserNewsState = require('../../src/models/UserNewsState');
const Game = require('../../src/models/Game');
const Wishlist = require('../../src/models/Wishlist');

// 17 chiffres, format Steam OpenID (commence par 7656119...)
let steamIdCounter = 76561198000000000n;

function nextSteamId() {
  steamIdCounter += 1n;
  return steamIdCounter.toString();
}

function buildUser(overrides = {}) {
  const followedGames = overrides.followedGames;
  const base = {
    steamId: overrides.steamId || nextSteamId(),
    language: 'fr',
    followedGames: [],
    recentActiveGames: [],
    notificationSettings: {
      newsNotifications: false,
      followPromptNotifications: false,
      fcmTokens: [],
      libraryFollowMode: 'off',
      wishlistFollowMode: 'off',
      confirmUnfollowGames: true,
    },
    gameLibrary: { games: [], lastFullSync: null },
    wishlist: { games: [], lastFullSync: null },
    newsFavorites: [],
  };

  const merged = { ...base, ...overrides };
  if (followedGames) {
    merged.followedGames = followedGames.map((entry) =>
      typeof entry === 'string'
        ? { appId: entry, followedAt: new Date() }
        : entry,
    );
  }
  return merged;
}

async function createUser(overrides = {}) {
  return User.create(buildUser(overrides));
}

function buildGameSubscription(overrides = {}) {
  return {
    gameId: overrides.gameId || String(Math.floor(Math.random() * 1_000_000) + 1),
    name: overrides.name || 'Test Game',
    imageUrl: overrides.imageUrl || '',
    subscribers: overrides.subscribers || [],
    lastNewsTimestamp: overrides.lastNewsTimestamp || 0,
    lastNewsCheck: overrides.lastNewsCheck || null,
    nextNewsCheckAt: overrides.nextNewsCheckAt || null,
    ...overrides,
  };
}

async function createGameSubscription(overrides = {}) {
  return GameSubscription.create(buildGameSubscription(overrides));
}

function buildUserNewsState(overrides = {}) {
  return {
    steamId: overrides.steamId || nextSteamId(),
    appId: overrides.appId || '730',
    newsId: overrides.newsId || `news-${Math.random().toString(36).slice(2, 10)}`,
    inFeedAt: overrides.inFeedAt || null,
    pushSentAt: overrides.pushSentAt || null,
    expiresAt:
      overrides.expiresAt || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

async function createUserNewsState(overrides = {}) {
  return UserNewsState.create(buildUserNewsState(overrides));
}

function buildGame(overrides = {}) {
  return {
    appId: overrides.appId || String(Math.floor(Math.random() * 1_000_000) + 1),
    name: overrides.name || 'Test Game',
    img_icon_url: overrides.img_icon_url || '',
    header_image: overrides.header_image || '',
    ...overrides,
  };
}

async function createGame(overrides = {}) {
  return Game.create(buildGame(overrides));
}

function buildWishlist(overrides = {}) {
  return {
    appId: overrides.appId || String(Math.floor(Math.random() * 1_000_000) + 1),
    name: overrides.name || 'Wishlisted Game',
    header_image: overrides.header_image || '',
    ...overrides,
  };
}

async function createWishlist(overrides = {}) {
  return Wishlist.create(buildWishlist(overrides));
}

function newObjectId() {
  return new mongoose.Types.ObjectId();
}

module.exports = {
  nextSteamId,
  newObjectId,
  buildUser,
  createUser,
  buildGameSubscription,
  createGameSubscription,
  buildUserNewsState,
  createUserNewsState,
  buildGame,
  createGame,
  buildWishlist,
  createWishlist,
};
