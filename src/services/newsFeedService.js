const GameSubscription = require('../models/GameSubscription');
const User = require('../models/User');
const steamService = require('./steamService');

/**
 * Build a multi-game news feed combining Steam news for several titles.
 * @param {Object} options
 * @param {string} [options.steamId] - Current user's steamId to resolve follow state.
 * @param {boolean} [options.followedOnly=false] - Restrict to games followed by the user.
 * @param {number} [options.limit=20] - Maximum number of news items returned.
 * @param {number} [options.perGameLimit=3] - Max number of news pulled per game.
 * @param {string} [options.language='fr'] - Steam language param.
 * @returns {Promise<{items: Array, metadata: Object}>}
 */
async function getNewsFeed({
  steamId,
  followedOnly = false,
  limit = 20,
  perGameLimit = 3,
  language = 'fr',
} = {}) {
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const safePerGameLimit = Math.max(1, Math.min(perGameLimit, 5));

  const followedSet = new Set();
  let user = null;

  if (steamId) {
    user = await User.findOne({ steamId });
    if (user && Array.isArray(user.followedGames)) {
      user.followedGames.forEach((appId) => {
        if (typeof appId === 'string') {
          followedSet.add(appId);
        } else if (appId && appId.appId) {
          followedSet.add(appId.appId);
        }
      });
    }
  }

  let subscriptions = [];

  if (followedOnly) {
    if (followedSet.size === 0) {
      return {
        items: [],
        metadata: {
          totalGamesQueried: 0,
          totalNewsRetrieved: 0,
          source: 'followed',
        },
      };
    }

    subscriptions = await GameSubscription.find({
      gameId: { $in: Array.from(followedSet) },
    })
      .sort({ updatedAt: -1 })
      .lean();
  } else {
    const estimatedGamesNeeded = Math.max(
      safePerGameLimit,
      Math.ceil(safeLimit / safePerGameLimit) + 2
    );

    subscriptions = await GameSubscription.find({})
      .sort({ updatedAt: -1 })
      .limit(estimatedGamesNeeded)
      .lean();
    const existingIds = new Set(subscriptions.map((sub) => sub.gameId));

    if (steamId) {
      try {
        const userLibrary = await steamService.getUserGames(steamId);

        if (Array.isArray(userLibrary) && userLibrary.length > 0) {
          const libraryExtras = userLibrary
            .map((game) => ({
              appId: game.appid ? game.appid.toString() : game.appId?.toString(),
              name: game.name,
              playtime: game.playtime_forever || 0,
              lastPlayed: game.rtime_last_played || 0,
            }))
            .filter((game) => game.appId && !existingIds.has(game.appId));

          libraryExtras.sort((a, b) => {
            const playtimeDelta = (b.playtime || 0) - (a.playtime || 0);
            if (playtimeDelta !== 0) {
              return playtimeDelta;
            }
            return (b.lastPlayed || 0) - (a.lastPlayed || 0);
          });

          const missingGames = Math.max(
            Math.ceil(safeLimit / safePerGameLimit) + 2 - subscriptions.length,
            0
          );

          const extraLimit = Math.min(
            Math.max(missingGames, safePerGameLimit),
            libraryExtras.length
          );

          libraryExtras.slice(0, extraLimit).forEach((game) => {
            existingIds.add(game.appId);
            subscriptions.push({
              gameId: game.appId,
              name: game.name || `Jeu ${game.appId}`,
              subscribers: [],
              lastNewsTimestamp: 0,
            });
          });
        }
      } catch (error) {
        console.error('Failed to extend news feed from user library:', error.message);
      }
    }
  }

  const feedItems = [];

  for (const subscription of subscriptions) {
    try {
      const newsItems = await steamService.getGameNews(
        subscription.gameId,
        safePerGameLimit,
        800,
        language
      );

      if (!Array.isArray(newsItems) || newsItems.length === 0) {
        continue;
      }

      newsItems.forEach((item) => {
        feedItems.push({
          appId: subscription.gameId,
          gameName: subscription.name,
          isFollowed: followedSet.has(subscription.gameId),
          subscribersCount: Array.isArray(subscription.subscribers)
            ? subscription.subscribers.length
            : 0,
          news: {
            id: item.gid,
            title: item.title,
            url: item.url,
            author: item.author,
            date: item.date * 1000,
            contents: item.contents,
            feedLabel: item.feedlabel,
          },
        });
      });
    } catch (error) {
      // Continue even if one game fails to load
      console.error(
        `Failed to fetch news for ${subscription.gameId}:`,
        error.message
      );
    }
  }

  feedItems.sort((a, b) => b.news.date - a.news.date);

  return {
    items: feedItems.slice(0, safeLimit),
    metadata: {
      totalGamesQueried: subscriptions.length,
      totalNewsRetrieved: feedItems.length,
      returnedCount: Math.min(feedItems.length, safeLimit),
      source: followedOnly ? 'followed' : 'all',
      steamId: steamId || null,
    },
  };
}

module.exports = {
  getNewsFeed,
};