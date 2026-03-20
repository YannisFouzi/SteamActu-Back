const { getUserAndFollowedGames, optimizeCandidates } = require('./newsFeed/newsFeedUserManager');
const {
  createCandidateManager,
  addSubscriptionCandidates,
} = require('./newsFeed/candidateManager');
const {
  processNewsForGames,
  filterAndSortNews,
} = require('./newsFeed/newsProcessor');
const UserNewsState = require('../models/UserNewsState');
const { normalizeAppLanguage } = require('../utils/language');

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;
const NEWS_WINDOW_DAYS = 14;
const FAVORITE_WINDOW_DAYS = 30;
const RECENT_WINDOW_MS = NEWS_WINDOW_DAYS * MS_IN_DAY;
const FAVORITE_WINDOW_MS = FAVORITE_WINDOW_DAYS * MS_IN_DAY;

const buildNewsKey = (appId, newsId) => `${appId}:${newsId}`;

/**
 * Build a multi-game news feed combining Steam news for several titles.
 * @param {Object} options
 * @param {string} [options.steamId] - Current user's steamId to resolve follow state.
 * @param {number} [options.limit=20] - Maximum number of news items returned.
 * @param {number} [options.perGameLimit=3] - Max number of news pulled per game.
 * @param {string} [options.language='fr'] - Steam language param.
 * @param {boolean} [options.favoritesOnly=false] - Filter favorites only
 * @returns {Promise<{items: Array, metadata: Object}>}
 */
async function getNewsFeed({
  steamId,
  limit = 20,
  perGameLimit = 3,
  language,
  favoritesOnly = false,
} = {}) {
  const safeLimit = Math.min(Math.max(limit || 20, 1), 200);
  const safePerGameLimit = Math.min(Math.max(perGameLimit || 3, 1), 20);
  const now = Date.now();

  const { user, followedSet } = await getUserAndFollowedGames(steamId);
  const resolvedLanguage = normalizeAppLanguage(language || user?.language);

  const { candidateMap, pushCandidate } = createCandidateManager();

  const canContinue = await addSubscriptionCandidates(
    pushCandidate,
    followedSet
  );

  if (!canContinue) {
    return {
      items: [],
      metadata: {
        totalGamesQueried: 0,
        totalNewsRetrieved: 0,
        source: 'followed',
        favoriteStats: {
          hasFavorites: false,
          favoritesOnly: Boolean(favoritesOnly),
          count: 0,
        },
      },
    };
  }

  let gamesToProcess = optimizeCandidates(
    candidateMap.values(),
    user,
    safeLimit,
    safePerGameLimit
  );

  if (gamesToProcess.length === 0) {
    return {
      items: [],
      metadata: {
        totalGamesQueried: 0,
        totalNewsRetrieved: 0,
        source: 'followed',
        favoriteStats: {
          hasFavorites: false,
          favoritesOnly: Boolean(favoritesOnly),
          count: 0,
        },
      },
    };
  }

  const { feedItems } = await processNewsForGames(
    gamesToProcess,
    followedSet,
    { perGameLimit: safePerGameLimit, language: resolvedLanguage }
  );

  const { timeline } = filterAndSortNews(feedItems);

  const favoriteEntries = Array.isArray(user?.newsFavorites)
    ? user.newsFavorites
    : [];
  const favoriteLookup = new Map();
  const validFavorites = [];
  let favoritesChanged = false;

  favoriteEntries.forEach((fav) => {
    if (!fav?.appId || !fav?.newsId) {
      favoritesChanged = true;
      return;
    }

    const newsDateMs = fav.newsDate ? new Date(fav.newsDate).getTime() : null;
    if (!newsDateMs || now - newsDateMs > FAVORITE_WINDOW_MS) {
      favoritesChanged = true;
      return;
    }

    const key = buildNewsKey(fav.appId, fav.newsId);
    favoriteLookup.set(key, fav);
    validFavorites.push(fav);
  });

  if (favoritesChanged && user) {
    user.newsFavorites = validFavorites;
    await user.save();
  }

  const filteredTimeline = [];
  let favoritesCount = 0;

  timeline.forEach((item) => {
    const newsDate = item.news?.date || 0;
    const key = buildNewsKey(item.appId, item.news?.id);
    const isFavorite = favoriteLookup.has(key);
    const maxAge = isFavorite ? FAVORITE_WINDOW_MS : RECENT_WINDOW_MS;

    if (now - newsDate > maxAge) {
      return;
    }

    if (favoritesOnly && !isFavorite) {
      return;
    }

    if (isFavorite) {
      favoritesCount++;
    }

    filteredTimeline.push({
      ...item,
      isFavorite,
    });
  });

  const hasFavorites = favoritesCount > 0;

  // Marquer les news servies dans le fil pour ce user (inFeedAt)
  if (steamId && filteredTimeline.length > 0) {
    const expiresAt = new Date(now + RETENTION_DAYS * MS_IN_DAY);
    const bulkOps = filteredTimeline.map((item) => ({
      updateOne: {
        filter: {
          steamId,
          appId: String(item.appId),
          newsId: String(item.news?.id),
        },
        update: {
          $set: { inFeedAt: new Date(now) },
          $setOnInsert: {
            steamId,
            appId: String(item.appId),
            newsId: String(item.news?.id),
            expiresAt,
          },
        },
        upsert: true,
      },
    }));

    try {
      await UserNewsState.bulkWrite(bulkOps, { ordered: false });
    } catch (err) {
      console.error('UserNewsState bulkWrite error:', err.message);
    }
  }

  return {
    items: filteredTimeline,
    metadata: {
      totalGamesQueried: gamesToProcess.length,
      totalNewsRetrieved: feedItems.length,
      returnedCount: filteredTimeline.length,
      recentCount: filteredTimeline.length,
      source: 'followed',
      steamId: steamId || null,
      favoriteStats: {
        hasFavorites,
        favoritesOnly: Boolean(favoritesOnly),
        count: favoritesCount,
      },
    },
  };
}
module.exports = {
  getNewsFeed,
};
