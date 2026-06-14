import { useEffect, useMemo, useRef, useState } from 'react';
import { CONTEXT, fetchNews, type NewsItem } from '../api';
import { readNewsCache, writeNewsCache } from '../newsCache';
import { addFavorite, markNewsFeedSeen, removeFavorite } from '../auth';
import { type FollowState } from '../useFollow';
import { formatDateTime, openExternal } from '../format';
import { useT } from '../i18n';
import FollowBell from '../components/FollowBell';
import { StarIcon } from '../components/Icons';

function favKey(appId: string, newsId: string): string {
  return `${appId}:${newsId}`;
}

export default function ActuTab({
  editable,
  follow,
  hasFollowedGames,
  onNavigateFollow,
}: {
  editable: boolean;
  follow: FollowState;
  hasFollowedGames: boolean;
  onNavigateFollow: () => void;
}) {
  const { t, lang } = useT();
  // Hydrate from the local cache so the feed shows instantly (stale-while-
  // revalidate), like the mobile app — no blocking "loading" on every open.
  const [cachedSnapshot] = useState(() =>
    readNewsCache(CONTEXT.steamId, lang, false),
  );
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>(
    cachedSnapshot ? 'ok' : 'loading',
  );
  const [error, setError] = useState('');
  const [items, setItems] = useState<NewsItem[]>(cachedSnapshot?.items ?? []);
  const [hasFavorites, setHasFavorites] = useState(
    cachedSnapshot?.hasFavorites ?? false,
  );
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(
    cachedSnapshot?.lastSeenAt ?? null,
  );
  const [favorites, setFavorites] = useState<Set<string>>(
    () =>
      new Set(
        (cachedSnapshot?.items ?? [])
          .filter((it) => it.isFavorite)
          .map((it) => favKey(String(it.appId), it.news.id)),
      ),
  );
  const [favBusy, setFavBusy] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const load = (favOnly: boolean, cancelledRef?: { v: boolean }) =>
    fetchNews(CONTEXT.steamId, lang, favOnly).then((data) => {
      if (cancelledRef?.v) return;
      const list = data.items ?? [];
      const favIds = list
        .filter((it) => it.isFavorite)
        .map((it) => favKey(String(it.appId), it.news.id));
      // Mirror mobile: any server-reported favorite OR a currently visible one.
      // The refetch after every toggle keeps this in sync with the server, so it
      // correctly drops back to false once the last favorite is removed.
      const nextHasFavorites =
        Boolean(data.metadata?.favoriteStats?.hasFavorites) || favIds.length > 0;
      const nextLastSeenAt =
        typeof data.metadata?.lastNewsFeedSeenAt === 'number'
          ? data.metadata.lastNewsFeedSeenAt
          : null;
      setItems(list);
      setHasFavorites(nextHasFavorites);
      setLastSeenAt(nextLastSeenAt);
      setFavorites(new Set(favIds));
      setStatus('ok');
      // Refresh the local cache so the next open is instant (SWR, like mobile).
      writeNewsCache(CONTEXT.steamId, lang, favOnly, {
        items: list,
        hasFavorites: nextHasFavorites,
        lastSeenAt: nextLastSeenAt,
      });
    });

  // Refetch on filter change (server-side favoritesOnly: favorites use a wider
  // 30-day window than the 14-day recent feed). Items stay on screen during the
  // refetch; only the very first load shows the loading state.
  useEffect(() => {
    const cancelledRef = { v: false };
    // Show this mode's cached feed instantly, then revalidate in the background.
    const cached = readNewsCache(CONTEXT.steamId, lang, favoritesOnly);
    if (cached) {
      setItems(cached.items);
      setHasFavorites(cached.hasFavorites);
      setLastSeenAt(cached.lastSeenAt);
      setFavorites(
        new Set(
          cached.items
            .filter((it) => it.isFavorite)
            .map((it) => favKey(String(it.appId), it.news.id)),
        ),
      );
      setStatus('ok');
    }
    load(favoritesOnly, cancelledRef).catch((err: unknown) => {
      if (cancelledRef.v) return;
      // Keep the cached feed on a refresh error; only surface it if we have nothing.
      if (!cached) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    });
    return () => {
      cancelledRef.v = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoritesOnly, lang]);

  // Mark the feed as seen when leaving it (sub-tab/main-tab switch unmounts
  // this component), mirroring the mobile markFeedSeen on blur.
  const seenRef = useRef(false);
  seenRef.current = editable && status === 'ok' && items.length > 0;
  useEffect(() => {
    return () => {
      if (seenRef.current) {
        markNewsFeedSeen(Date.now()).catch((e: unknown) =>
          console.error('[GameNews] mark seen failed', e),
        );
      }
    };
  }, []);

  const toggleFavorite = (item: NewsItem) => {
    const appId = String(item.appId);
    const newsId = item.news.id;
    const key = favKey(appId, newsId);
    if (favBusy.has(key)) return;
    const isFav = favorites.has(key);
    // In favorites-only view all favorites are visible, so the set size is the
    // true count; removing the last one means there are no favorites left.
    const willBeEmpty = isFav && favoritesOnly && favorites.size - 1 <= 0;

    setFavBusy((prev) => new Set(prev).add(key));
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(key);
      else next.add(key);
      setHasFavorites(next.size > 0); // optimistic, server reconciles below
      return next;
    });

    const action = isFav
      ? removeFavorite(appId, newsId)
      : addFavorite(appId, newsId, item.news.date);
    action
      .then(() => {
        // Removed the last favorite while filtering → exit the filter so all
        // news comes back (the favoritesOnly effect reloads show-all).
        if (willBeEmpty) {
          setFavoritesOnly(false);
          return;
        }
        // Refetch in the current mode (mirrors mobile): drops an unfavorited
        // item in favorites-only view and keeps hasFavorites in sync.
        return load(favoritesOnly);
      })
      .catch((err: unknown) => {
        console.error('[GameNews] toggle favorite failed', err);
        setFavorites((prev) => {
          const next = new Set(prev);
          if (isFav) next.add(key);
          else next.delete(key);
          setHasFavorites(next.size > 0);
          return next; // revert
        });
      })
      .finally(() =>
        setFavBusy((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        }),
      );
  };

  // The filter shows whenever there's a favorite (server flag, kept fresh by the
  // post-toggle refetch) or while the filter is active so it can be turned off.
  const showFilter = hasFavorites || favoritesOnly;

  const filter = showFilter ? (
    <div className="feed-filter">
      <span className="feed-filter-label">{t('news.favoritesOnly')}</span>
      <button
        type="button"
        className={`toggle ${favoritesOnly ? 'on' : ''}`}
        role="switch"
        aria-checked={favoritesOnly}
        onClick={() => setFavoritesOnly((v) => !v)}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  ) : null;

  // Le fil ne montre que les news des jeux ACTUELLEMENT suivis : désuivre depuis
  // une card (bouton +) la fait disparaître instantanément, comme l'app mobile
  // (removeNewsByAppId). `follow.followed` change de référence à chaque toggle →
  // recalcul réactif. (Le fil = news des jeux suivis, donc le + ne fait
  // qu'unfollow ici.)
  const visibleItems = useMemo(
    () => items.filter((it) => follow.followed.has(String(it.appId))),
    [items, follow.followed],
  );

  if (status === 'loading') {
    return <div className="state">{t('news.loadingFeed')}</div>;
  }
  if (status === 'error') {
    return <div className="state error">{t('common.error')} — {error}</div>;
  }
  if (visibleItems.length === 0) {
    return (
      <>
        {filter}
        {favoritesOnly ? (
          <div className="feed-empty">
            <div className="feed-empty-title">{t('news.favoritesEmptyTitle')}</div>
            <div className="feed-empty-text">{t('news.favoritesEmptyText')}</div>
          </div>
        ) : hasFollowedGames ? (
          <div className="feed-empty">
            <div className="feed-empty-title">{t('news.noRecentNewsTitle')}</div>
            <div className="feed-empty-text">{t('news.noRecentNewsText')}</div>
          </div>
        ) : (
          <div className="feed-empty">
            <div className="feed-empty-title">{t('news.noFollowedGamesTitle')}</div>
            <div className="feed-empty-text">{t('news.noFollowedGamesText')}</div>
            <button className="feed-empty-action" onClick={onNavigateFollow}>
              {t('news.noFollowedGamesAction')}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {filter}
      <div className="news-list">
        {visibleItems.map((item) => {
          const appId = String(item.appId);
          const key = favKey(appId, item.news.id);
          const isFav = favorites.has(key);
          const inFeedMs = item.inFeedAt ? new Date(item.inFeedAt).getTime() : 0;
          const isSeen =
            lastSeenAt !== null && inFeedMs > 0 && inFeedMs <= lastSeenAt;
          const url =
            item.news.url ||
            (item.appId
              ? `https://store.steampowered.com/news/app/${item.appId}`
              : '');
          return (
            <div
              key={`${item.appId}-${item.news.id}`}
              className={`news-card ${isSeen ? 'seen' : ''}`}
              role="link"
              tabIndex={0}
              onClick={() => url && openExternal(url)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && url) {
                  e.preventDefault();
                  openExternal(url);
                }
              }}
            >
              {item.news.firstImageUrl && (
                <img
                  className="news-card-cover"
                  src={item.news.firstImageUrl}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
              <div className="news-card-body">
                <div className="news-card-top">
                  <div className="news-card-game">
                    <div
                      className="logo"
                      style={
                        item.gameLogoUrl
                          ? { backgroundImage: `url(${JSON.stringify(item.gameLogoUrl)})` }
                          : undefined
                      }
                    />
                    <span className="news-game">{item.gameName}</span>
                  </div>
                  {editable && (
                    <div className="news-actions">
                      <FollowBell
                        followed={follow.followed.has(appId)}
                        notified={follow.notified.has(appId)}
                        busy={follow.busy.has(appId)}
                        onPlus={() =>
                          follow.followed.has(appId)
                            ? follow.unfollow(appId, item.gameName, item.gameLogoUrl ?? '')
                            : follow.followSilent(appId, item.gameName, item.gameLogoUrl ?? '')
                        }
                        onBell={() =>
                          follow.followed.has(appId)
                            ? follow.toggleNotify(appId)
                            : follow.followNotify(appId, item.gameName, item.gameLogoUrl ?? '')
                        }
                        size={20}
                      />
                      <button
                        type="button"
                        className={`fav-btn ${isFav ? 'on' : ''}`}
                        disabled={favBusy.has(key)}
                        aria-pressed={isFav}
                        aria-label={isFav ? t('news.removeFavorite') : t('news.addFavorite')}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(item);
                        }}
                      >
                        <StarIcon size={20} filled={isFav} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="news-date">
                  {formatDateTime(item.news.date, lang)}
                </div>
                <div className="news-title">{item.news.title}</div>
                {item.news.summary && (
                  <div className="news-summary">{item.news.summary}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
