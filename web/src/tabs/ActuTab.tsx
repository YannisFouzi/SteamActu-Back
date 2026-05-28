import { useEffect, useState } from 'react';
import { CONTEXT, fetchNews, type NewsItem } from '../api';
import { formatDateTime, openExternal } from '../format';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; items: NewsItem[] };

export default function ActuTab() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    fetchNews(CONTEXT.steamId, CONTEXT.language)
      .then((data) => {
        if (!cancelled) {
          setState({ status: 'ok', items: data.items ?? [] });
        }
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
              <div>
                <div className="news-game">{item.gameName}</div>
                <div className="news-date">
                  {formatDateTime(item.news.date, CONTEXT.language)}
                </div>
              </div>
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
