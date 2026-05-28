declare global {
  interface Window {
    __GAME_NEWS__?: { steamId?: string; language?: string };
  }
}

// SteamID/language are injected into index.html by the backend. Fall back to
// parsing the URL path (/feed/<steamId>) so the SPA also works standalone.
function readContext(): { steamId: string; language: string } {
  const injected = window.__GAME_NEWS__ ?? {};
  let steamId = injected.steamId ?? '';
  if (!/^\d{17}$/.test(steamId)) {
    const match = window.location.pathname.match(/\/feed\/(\d{17})/);
    steamId = match?.[1] ?? '';
  }
  return { steamId, language: injected.language ?? '' };
}

export const CONTEXT = readContext();

export interface NewsItem {
  appId: number | string;
  gameName: string;
  gameLogoUrl: string | null;
  news: {
    id: string;
    title: string;
    url: string;
    date: number;
    firstImageUrl: string | null;
  };
}

export interface FollowedGame {
  appId: string;
  name: string;
  header_image: string;
  imageUrl: string;
  followedAt: string | null;
}

export interface WishlistGame {
  appId: string;
  name: string;
  header_image: string;
  date_added: number;
  isFollowed: boolean;
}

export interface WebProfile {
  steamId: string;
  language: string;
  followedGames: FollowedGame[];
  wishlist: WishlistGame[];
  account: {
    followedCount: number;
    wishlistCount: number;
    newsNotifications: boolean;
    libraryFollowMode: string;
    wishlistFollowMode: string;
  };
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchNews(steamId: string, language: string): Promise<{ items: NewsItem[] }> {
  const q = language ? `?language=${encodeURIComponent(language)}` : '';
  return getJSON(`/api/news/feed-by-steamid/${encodeURIComponent(steamId)}${q}`);
}

export function fetchProfile(steamId: string): Promise<WebProfile> {
  return getJSON(`/api/web/profile/${encodeURIComponent(steamId)}`);
}
