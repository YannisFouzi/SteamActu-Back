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
  const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
  const safeLimit = Math.max(200, Math.min(limit || 200, 200));
  const safePerGameLimit = Math.max(10, Math.min(perGameLimit || 10, 20));
  const now = Date.now();
  const cutoffTimestamp = now - RECENT_WINDOW_MS;

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

  const candidateMap = new Map();
  const pushCandidate = (appId, name, source) => {
    if (!appId) {
      return;
    }
    const normalizedId = appId.toString();
    if (!candidateMap.has(normalizedId)) {
      candidateMap.set(normalizedId, {
        appId: normalizedId,
        name: name || `Jeu ${normalizedId}`,
        source,
      });
    }
  };

  if (!followedOnly && user?.recentActiveGames?.length) {
    const recentStored = user.recentActiveGames
      .filter((item) => {
        if (!item?.appId || !item?.lastNewsDate) {
          return false;
        }
        const timestamp = new Date(item.lastNewsDate).getTime();
        return !Number.isNaN(timestamp) && timestamp >= cutoffTimestamp;
      })
      .sort((a, b) => new Date(b.lastNewsDate).getTime() - new Date(a.lastNewsDate).getTime());

    recentStored.forEach((item) => pushCandidate(item.appId, item.name, 'recent-cache'));
  }

  let subscriptions = [];
  const subscriptionMap = new Map();

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
    subscriptions = await GameSubscription.find({}).lean();
  }

  const sortedSubscriptions = subscriptions.sort((a, b) => {
    const aDate = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bDate = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bDate - aDate;
  });

  sortedSubscriptions.forEach((sub) => {
    if (sub?.gameId) {
      subscriptionMap.set(sub.gameId.toString(), sub);
      pushCandidate(sub.gameId, sub.name, 'subscription');
    }
  });

  if (!followedOnly && candidateMap.size === 0 && steamId) {
    try {
      const userLibrary = await steamService.getUserGames(steamId);

      if (Array.isArray(userLibrary) && userLibrary.length > 0) {
        const libraryCandidates = userLibrary
          .map((game) => ({
            appId: game.appid ? game.appid.toString() : game.appId?.toString(),
            name: game.name,
            playtime: game.playtime_forever || 0,
            lastPlayed: game.rtime_last_played || 0,
          }))
          .filter((game) => game.appId)
          .sort((a, b) => {
            const aLast = a.lastPlayed || 0;
            const bLast = b.lastPlayed || 0;
            if (bLast !== aLast) {
              return bLast - aLast;
            }
            return (b.playtime || 0) - (a.playtime || 0);
          });

        libraryCandidates.forEach((game) => {
          pushCandidate(game.appId, game.name, 'library');
        });
      }
    } catch (error) {
      console.error('Failed to extend news feed from user library:', error.message);
    }
  }

  let gamesToProcess = Array.from(candidateMap.values());

  if (!followedOnly) {
    const maxCandidates = Math.max(safeLimit * 2, safePerGameLimit * 10, 100);
    gamesToProcess = gamesToProcess
      .sort((a, b) => {
        const aStored = user?.recentActiveGames?.find((item) => item.appId === a.appId);
        const bStored = user?.recentActiveGames?.find((item) => item.appId === b.appId);
        const aDate = aStored ? new Date(aStored.lastNewsDate).getTime() : 0;
        const bDate = bStored ? new Date(bStored.lastNewsDate).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, maxCandidates);
  }

  if (gamesToProcess.length === 0) {
    return {
      items: [],
      metadata: {
        totalGamesQueried: 0,
        totalNewsRetrieved: 0,
        source: followedOnly ? 'followed' : 'all',
      },
    };
  }

  const feedItems = [];
  const latestNewsByGame = new Map();

  console.log('newsFeed: start', {
    steamId,
    followedOnly,
    limit: safeLimit,
    perGameLimit: safePerGameLimit,
    candidates: gamesToProcess.length,
  });

  for (const game of gamesToProcess) {
    try {
      const newsItems = await steamService.getGameNews(
        game.appId,
        safePerGameLimit,
        800,
        language
      );

      if (!Array.isArray(newsItems) || newsItems.length === 0) {
        console.log('newsFeed: no news for game', game.appId);
        continue;
      }

      console.log('newsFeed: fetched news', {
        gameId: game.appId,
        count: newsItems.length,
        firstDate: newsItems[0]?.date,
        lastDate: newsItems[newsItems.length - 1]?.date,
      });

      newsItems.forEach((item) => {
        const newsDate = item.date * 1000;
        feedItems.push({
          appId: game.appId,
          gameName: game.name,
          isFollowed: followedSet.has(game.appId),
          news: {
            id: item.gid,
            title: item.title,
            url: item.url,
            author: item.author,
            date: newsDate,
            contents: item.contents,
            feedLabel: item.feedlabel,
          },
        });

        const currentLatest = latestNewsByGame.get(game.appId) || 0;
        if (newsDate > currentLatest) {
          latestNewsByGame.set(game.appId, newsDate);
        }
      });
    } catch (error) {
      console.error(`Failed to fetch news for ${game.appId}:`, error.message);
    }
  }

  feedItems.sort((a, b) => b.news.date - a.news.date);

  const recentItems = feedItems.filter((item) => item.news.date >= cutoffTimestamp);
  const timeline = recentItems.length > 0 ? recentItems : feedItems;

  if (!followedOnly && user) {
    const activeGames = [];
    latestNewsByGame.forEach((timestamp, appId) => {
      if (timestamp >= cutoffTimestamp) {
        const candidate = candidateMap.get(appId);
        activeGames.push({
          appId,
          name: candidate?.name || `Jeu ${appId}`,
          lastNewsDate: new Date(timestamp),
        });
      }
    });

    activeGames.sort((a, b) => new Date(b.lastNewsDate) - new Date(a.lastNewsDate));
    const limitedActive = activeGames.slice(0, 200);

    try {
      await User.updateOne(
        { steamId },
        {
          recentActiveGames: limitedActive,
        }
      );
    } catch (error) {
      console.error('Failed to store recentActiveGames for user', steamId, error);
    }
  }

  console.log('newsFeed: final timeline', {
    timelineCount: timeline.length,
    recentCount: recentItems.length,
    earliestDate: timeline[timeline.length - 1]?.news?.date || null,
    latestDate: timeline[0]?.news?.date || null,
  });

  return {
    items: timeline,
    metadata: {
      totalGamesQueried: gamesToProcess.length,
      totalNewsRetrieved: feedItems.length,
      returnedCount: timeline.length,
      recentCount: recentItems.length,
      source: followedOnly ? 'followed' : 'all',
      steamId: steamId || null,
    },
  };
}
module.exports = {
  getNewsFeed,
};
