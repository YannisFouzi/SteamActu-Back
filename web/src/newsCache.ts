import type { NewsItem } from './api';

// Local news cache — the web equivalent of the mobile useNewsManager AsyncStorage
// cache. Lets the feed render instantly from the last result while a fresh copy
// is fetched in the background (stale-while-revalidate), instead of blocking on
// the slow live Steam call every time the NEWS view mounts.
//
// In the Millennium plugin's iframe, localStorage is partitioned by Chrome but
// persists per-origin, so the iframe reading its own cache works fine.

const PREFIX = 'gn_news_cache_';
const MAX_ITEMS = 200; // bound the stored size (one feed page is ~20-60 items)

export interface CachedFeed {
  items: NewsItem[];
  hasFavorites: boolean;
  lastSeenAt: number | null;
}

function cacheKey(steamId: string, lang: string, favoritesOnly: boolean): string {
  return `${PREFIX}${steamId}_${lang}_${favoritesOnly ? 'fav' : 'all'}`;
}

export function readNewsCache(
  steamId: string,
  lang: string,
  favoritesOnly: boolean,
): CachedFeed | null {
  try {
    const raw = localStorage.getItem(cacheKey(steamId, lang, favoritesOnly));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFeed;
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeNewsCache(
  steamId: string,
  lang: string,
  favoritesOnly: boolean,
  data: CachedFeed,
): void {
  try {
    const payload: CachedFeed = {
      items: data.items.slice(0, MAX_ITEMS),
      hasFavorites: data.hasFavorites,
      lastSeenAt: data.lastSeenAt,
    };
    localStorage.setItem(
      cacheKey(steamId, lang, favoritesOnly),
      JSON.stringify(payload),
    );
  } catch {
    /* ignore quota / unavailable */
  }
}
