const { getNewsFeed } = require('./newsFeedService');
const UserNewsState = require('../models/UserNewsState');
const User = require('../models/User');
const {
  getMutedAppIds,
  getFollowedAtByAppId,
} = require('../utils/followedGamesHelpers');
const logger = require('../utils/logger');

const MS_IN_DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 90;

function stateKey(appId, newsId) {
  return `${String(appId)}::${String(newsId)}`;
}

function toToastShape(item) {
  return {
    appId: String(item.appId),
    gameName: item.gameName,
    gameLogoUrl: item.gameLogoUrl ?? null,
    news: {
      id: String(item.news?.id),
      title: item.news?.title,
      url: item.news?.url,
    },
  };
}

/**
 * Server-authoritative "what should the Steam Desktop plugin toast?" — the
 * single source of truth that replaces the plugin's local localStorage seen-set
 * and its silent startup seed.
 *
 * Rules:
 *   - FIRST call ever for a user (no `desktopToastSeededAt`): mark every current
 *     feed item as toast-delivered (silently) and toast NOTHING. This is the
 *     server-side equivalent of the old client seed — avoids flooding the
 *     existing backlog the first time.
 *   - Afterwards: return only news not yet delivered on ANY surface, i.e. with
 *     neither `pushSentAt` (mobile FCM) nor `steamToastSentAt` (desktop). This
 *     is what stops the desktop from re-toasting a news already pushed to the
 *     phone. The returned news are immediately marked `steamToastSentAt` (claim).
 *
 * The mobile cron never reads `steamToastSentAt`, so claiming here can never
 * suppress a mobile push — a toast that fails to render only loses that one
 * desktop toast.
 */
async function getPendingDesktopToasts(steamId, { language } = {}) {
  const feed = await getNewsFeed({ steamId, language });
  const items = (feed && feed.items) || [];
  if (items.length === 0) {
    return [];
  }

  const keys = items
    .map((it) => ({ appId: String(it.appId), newsId: String(it.news?.id || '') }))
    .filter((k) => k.appId && k.newsId);
  if (keys.length === 0) {
    return [];
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RETENTION_DAYS * MS_IN_DAY);

  const user = await User.findOne({ steamId })
    .select('desktopToastSeededAt followedGames')
    .lean();
  const seeded = Boolean(user && user.desktopToastSeededAt);
  // Suivi silencieux (bouton +) : un toast desktop est une notification, même
  // règle que le push mobile — les jeux mutés restent dans le fil mais ne
  // toastent pas. (Le seed, lui, marque tout le backlog, jeux mutés inclus :
  // s'ils repassent en notifié plus tard, on ne re-toaste pas le passé.)
  const mutedAppIds = getMutedAppIds(user);
  // Ne jamais toaster une news antérieure au follow du jeu : le seed
  // (desktopToastSeededAt) est global au user, pas par-jeu — re-suivre (ou
  // suivre un nouveau jeu après le 1er seed) laisse son backlog non-seedé.
  // followedAt borne la fenêtre de notification au moment du suivi.
  const followedAtByAppId = getFollowedAtByAppId(user);

  // First contact: silently mark the whole current backlog as delivered.
  if (!seeded) {
    const ops = keys.map((k) => ({
      updateOne: {
        filter: { steamId, appId: k.appId, newsId: k.newsId },
        update: {
          $set: { steamToastSentAt: now },
          $setOnInsert: { steamId, appId: k.appId, newsId: k.newsId, expiresAt },
        },
        upsert: true,
      },
    }));
    try {
      await UserNewsState.bulkWrite(ops, { ordered: false });
      await User.updateOne(
        { steamId },
        { $set: { desktopToastSeededAt: now } },
      );
    } catch (err) {
      logger.error({ err }, 'desktop_toast_seed_failed');
    }
    return [];
  }

  // Ongoing: which current items were never delivered on any surface?
  const rows = await UserNewsState.find({ steamId, $or: keys })
    .select('appId newsId pushSentAt steamToastSentAt')
    .lean();
  const stateByKey = new Map(
    rows.map((r) => [stateKey(r.appId, r.newsId), r]),
  );

  const undelivered = items.filter((it) => {
    const row = stateByKey.get(stateKey(it.appId, it.news?.id));
    if (!row) {
      return true; // brand-new news, never recorded
    }
    return !row.pushSentAt && !row.steamToastSentAt;
  });

  // Suivi silencieux (bouton +) : dans le fil, jamais en toast. On les CLAIM
  // quand même (steamToastSentAt) : une news arrivée pendant que le jeu était
  // muté est consommée silencieusement — réactiver la cloche plus tard ne doit
  // pas faire re-toaster le backlog (parité avec le cron mobile, qui ne
  // revisite jamais une vieille news).
  const toToast = undelivered.filter((it) => {
    if (mutedAppIds.has(String(it.appId))) {
      return false;
    }
    const followedAt = followedAtByAppId.get(String(it.appId));
    // News publiée avant le follow → claim silencieux (cf. ops sur undelivered),
    // jamais toastée. news.date est en ms (newsProcessor : item.date * 1000,
    // donc granularité seconde) : on ne filtre que si le follow tombe dans une
    // seconde STRICTEMENT postérieure (parité avec le cron mobile).
    if (
      followedAt &&
      it.news?.date &&
      followedAt.getTime() >= it.news.date + 1000
    ) {
      return false;
    }
    return true;
  });

  if (undelivered.length === 0) {
    return [];
  }

  const ops = undelivered.map((it) => ({
    updateOne: {
      filter: {
        steamId,
        appId: String(it.appId),
        newsId: String(it.news?.id),
      },
      update: {
        $set: { steamToastSentAt: now },
        $setOnInsert: {
          steamId,
          appId: String(it.appId),
          newsId: String(it.news?.id),
          expiresAt,
        },
      },
      upsert: true,
    },
  }));
  try {
    await UserNewsState.bulkWrite(ops, { ordered: false });
  } catch (err) {
    logger.error({ err }, 'desktop_toast_claim_failed');
  }

  return toToast.map(toToastShape);
}

module.exports = { getPendingDesktopToasts };
