import { useEffect, useRef, useState } from 'react';
import { CONTEXT, fetchNews, type NewsItem } from '../api';
import { addFavorite, markNewsFeedSeen, removeFavorite } from '../auth';
import { type FollowState } from '../useFollow';
import { formatDateTime, openExternal } from '../format';
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
  const [status, setStatus] = useState<'loading' | 'error' | 'ok'>('loading');
  const [error, setError] = useState('');
  const [items, setItems] = useState<NewsItem[]>([]);
  const [hasFavorites, setHasFavorites] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favBusy, setFavBusy] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const load = (favOnly: boolean, cancelledRef?: { v: boolean }) =>
    fetchNews(CONTEXT.steamId, CONTEXT.language, favOnly).then((data) => {
      if (cancelledRef?.v) return;
      const list = data.items ?? [];
      setItems(list);
      setHasFavorites(Boolean(data.metadata?.favoriteStats?.hasFavorites));
      setLastSeenAt(
        typeof data.metadata?.lastNewsFeedSeenAt === 'number'
          ? data.metadata.lastNewsFeedSeenAt
          : null,
      );
      setFavorites(
        new Set(
          list
            .filter((it) => it.isFavorite)
            .map((it) => favKey(String(it.appId), it.news.id)),
        ),
      );
      setStatus('ok');
    });

  // Refetch on filter change (server-side favoritesOnly: favorites use a wider
  // 30-day window than the 14-day recent feed). Items stay on screen during the
  // refetch; only the very first load shows the loading state.
  useEffect(() => {
    const cancelledRef = { v: false };
    load(favoritesOnly, cancelledRef).catch((err: unknown) => {
      if (cancelledRef.v) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    });
    return () => {
      cancelledRef.v = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoritesOnly]);

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

    setFavBusy((prev) => new Set(prev).add(key));
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(key);
      else next.add(key);
      return next; // optimistic
    });

    const action = isFav
      ? removeFavorite(appId, newsId)
      : addFavorite(appId, newsId, item.news.date);
    action
      .then(() => {
        // In favorites-only view, refetch so an unfavorited item drops out.
        if (favoritesOnly) return load(true);
      })
      .catch((err: unknown) => {
        console.error('[GameNews] toggle favorite failed', err);
        setFavorites((prev) => {
          const next = new Set(prev);
          if (isFav) next.add(key);
          else next.delete(key);
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

  const showFilter = hasFavorites || favoritesOnly;

  const filter = showFilter ? (
    <div className="feed-filter">
      <span className="feed-filter-label">Afficher uniquement les favoris</span>
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

  if (status === 'loading') {
    return <div className="state">Chargement des actualités…</div>;
  }
  if (status === 'error') {
    return <div className="state error">Échec du chargement — {error}</div>;
  }
  if (items.length === 0) {
    return (
      <>
        {filter}
        {hasFollowedGames ? (
          <div className="feed-empty">
            <div className="feed-empty-title">Aucune actualité récente</div>
            <div className="feed-empty-text">
              Vos jeux suivis n'ont pas publié de nouvelles actualités. Revenez
              plus tard ou suivez d'autres jeux pour élargir le flux.
            </div>
          </div>
        ) : (
          <div className="feed-empty">
            <div className="feed-empty-title">Vous ne suivez aucun jeu</div>
            <div className="feed-empty-text">
              Suivez un jeu pour commencer à recevoir des actualités.
            </div>
            <button className="feed-empty-action" onClick={onNavigateFollow}>
              Suivre un jeu
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
        {items.map((item) => {
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
              <div className="news-head">
                <div
                  className="logo"
                  style={
                    item.gameLogoUrl
                      ? { backgroundImage: `url(${JSON.stringify(item.gameLogoUrl)})` }
                      : undefined
                  }
                />
                <div className="news-head-meta">
                  <div className="news-game">{item.gameName}</div>
                  <div className="news-date">
                    {formatDateTime(item.news.date, CONTEXT.language)}
                  </div>
                </div>
                {editable && (
                  <div className="news-actions">
                    <FollowBell
                      following={follow.followed.has(appId)}
                      busy={follow.busy.has(appId)}
                      onToggle={() =>
                        follow.toggle(appId, item.gameName, item.gameLogoUrl ?? '')
                      }
                      size={20}
                    />
                    <button
                      type="button"
                      className={`fav-btn ${isFav ? 'on' : ''}`}
                      disabled={favBusy.has(key)}
                      aria-pressed={isFav}
                      aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
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
              <div className="news-title">{item.news.title}</div>
              {item.news.firstImageUrl && (
                <img
                  className="news-image"
                  src={item.news.firstImageUrl}
                  alt=""
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
