import { useEffect, useState } from 'react';
import { CONTEXT, fetchNews, type NewsItem } from '../api';
import { addFavorite, removeFavorite } from '../auth';
import { type FollowState } from '../useFollow';
import { formatDateTime, openExternal } from '../format';
import FollowBell from '../components/FollowBell';
import { StarIcon } from '../components/Icons';

function favKey(appId: string, newsId: string): string {
  return `${appId}:${newsId}`;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; items: NewsItem[] };

export default function ActuTab({
  editable,
  follow,
}: {
  editable: boolean;
  follow: FollowState;
}) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favBusy, setFavBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetchNews(CONTEXT.steamId, CONTEXT.language)
      .then((data) => {
        if (cancelled) return;
        const items = data.items ?? [];
        setState({ status: 'ok', items });
        setFavorites(
          new Set(
            items
              .filter((it) => it.isFavorite)
              .map((it) => favKey(String(it.appId), it.news.id)),
          ),
        );
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
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

  if (state.status === 'loading') {
    return <div className="state">Loading news…</div>;
  }
  if (state.status === 'error') {
    return <div className="state error">Failed to load news — {state.error}</div>;
  }
  if (state.items.length === 0) {
    return <div className="state">No news yet for the games you follow.</div>;
  }

  return (
    <div className="news-list">
      {state.items.map((item) => {
        const appId = String(item.appId);
        const key = favKey(appId, item.news.id);
        const isFav = favorites.has(key);
        const url =
          item.news.url ||
          (item.appId
            ? `https://store.steampowered.com/news/app/${item.appId}`
            : '');
        return (
          <div
            key={`${item.appId}-${item.news.id}`}
            className="news-card"
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
  );
}
