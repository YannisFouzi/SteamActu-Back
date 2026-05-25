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
const logger = require('../utils/logger');

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
        lastNewsFeedSeenAt: user?.lastNewsFeedSeenAt
          ? new Date(user.lastNewsFeedSeenAt).getTime()
          : null,
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
        lastNewsFeedSeenAt: user?.lastNewsFeedSeenAt
          ? new Date(user.lastNewsFeedSeenAt).getTime()
          : null,
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

  // Augmente chaque item avec son inFeedAt = première exposition de cette news
  // dans le feed de ce user. Sert au front à comparer (inFeedAt <= lastSeenAt)
  // pour le grisage "vu", au lieu de news.date — gère correctement le cas
  // d'une news plus ancienne qui apparaît pour la première fois après un follow.
  const nowDate = new Date(now);
  const existingInFeedMap = new Map();

  if (steamId && filteredTimeline.length > 0) {
    const lookupKeys = filteredTimeline
      .map((item) => ({
        appId: String(item.appId),
        newsId: String(item.news?.id || ''),
      }))
      .filter((k) => k.appId && k.newsId);

    if (lookupKeys.length > 0) {
      try {
        const existingRows = await UserNewsState.find({
          steamId,
          $or: lookupKeys,
        })
          .select('appId newsId inFeedAt')
          .lean();

        existingRows.forEach((row) => {
          existingInFeedMap.set(buildNewsKey(row.appId, row.newsId), row);
        });
      } catch (err) {
        logger.error('UserNewsState lookup error:', err.message);
      }
    }
  }

  const augmentedTimeline = filteredTimeline.map((item) => {
    const key = buildNewsKey(item.appId, item.news?.id);
    const existing = existingInFeedMap.get(key);
    const inFeedAt = existing?.inFeedAt
      ? new Date(existing.inFeedAt)
      : nowDate;
    return { ...item, inFeedAt };
  });

  // Marquer les news servies dans le fil pour ce user. Skip les rows qui ont
  // déjà un inFeedAt non-null (préserve la PREMIÈRE exposition pour la sémantique
  // "était dans ton feed avant ta dernière visite"). On écrit dans 2 cas :
  //   - aucune row (insert avec inFeedAt = now via $set, qui s'applique aussi sur insert)
  //   - row existante mais inFeedAt = null (créée par newsRotationService lors du push)
  if (steamId && augmentedTimeline.length > 0) {
    const expiresAt = new Date(now + RETENTION_DAYS * MS_IN_DAY);
    const bulkOps = augmentedTimeline
      .map((item) => {
        const key = buildNewsKey(item.appId, item.news?.id);
        const existing = existingInFeedMap.get(key);
        if (existing && existing.inFeedAt) {
          return null;
        }
        return {
          updateOne: {
            filter: {
              steamId,
              appId: String(item.appId),
              newsId: String(item.news?.id),
            },
            update: {
              $set: { inFeedAt: nowDate },
              $setOnInsert: {
                steamId,
                appId: String(item.appId),
                newsId: String(item.news?.id),
                expiresAt,
              },
            },
            upsert: true,
          },
        };
      })
      .filter(Boolean);

    if (bulkOps.length > 0) {
      try {
        await UserNewsState.bulkWrite(bulkOps, { ordered: false });
      } catch (err) {
        logger.error('UserNewsState bulkWrite error:', err.message);
      }
    }
  }

  return {
    items: augmentedTimeline,
    metadata: {
      totalGamesQueried: gamesToProcess.length,
      totalNewsRetrieved: feedItems.length,
      returnedCount: augmentedTimeline.length,
      recentCount: augmentedTimeline.length,
      source: 'followed',
      steamId: steamId || null,
      favoriteStats: {
        hasFavorites,
        favoritesOnly: Boolean(favoritesOnly),
        count: favoritesCount,
      },
      lastNewsFeedSeenAt: user?.lastNewsFeedSeenAt
        ? new Date(user.lastNewsFeedSeenAt).getTime()
        : null,
    },
  };
}
module.exports = {
  getNewsFeed,
};
