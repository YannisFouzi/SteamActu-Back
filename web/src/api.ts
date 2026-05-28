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
  isFavorite?: boolean;
  inFeedAt?: string | null;
  news: {
    id: string;
    title: string;
    url: string;
    date: number;
    firstImageUrl: string | null;
  };
}

export interface NewsFeedResult {
  items?: NewsItem[];
  metadata?: {
    favoriteStats?: { hasFavorites?: boolean; favoritesOnly?: boolean; count?: number };
    lastNewsFeedSeenAt?: number | null;
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
    steamNotifications: boolean;
    preferSteamWhenOpen: boolean;
    confirmUnfollowGames: boolean;
    libraryFollowMode: string;
    wishlistFollowMode: string;
  };
}

export const SUPPORTED_LANGUAGES = ['fr', 'en', 'de', 'es', 'ru', 'zh'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const LANGUAGE_NATIVE_LABELS: Record<AppLanguage, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
  es: 'Español',
  ru: 'Русский',
  zh: '简体中文',
};

export async function submitFeedback(payload: {
  type: 'bug' | 'feature';
  message: string;
  email: string;
  steamId: string;
}): Promise<void> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) msg = data.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function fetchNews(
  steamId: string,
  language: string,
  favoritesOnly = false,
): Promise<NewsFeedResult> {
  const params = new URLSearchParams();
  if (language) params.set('language', language);
  if (favoritesOnly) params.set('favoritesOnly', 'true');
  const q = params.toString();
  return getJSON(
    `/api/news/feed-by-steamid/${encodeURIComponent(steamId)}${q ? `?${q}` : ''}`,
  );
}

export function fetchProfile(steamId: string): Promise<WebProfile> {
  return getJSON(`/api/web/profile/${encodeURIComponent(steamId)}`);
}

export interface SearchResult {
  appid: number;
  name: string;
  header_image: string;
  tiny_image: string;
}

export interface LibraryGame {
  appId: string;
  name: string;
  header_image: string;
  isFamilyShared: boolean;
  playtimeForever: number;
  playtime2weeks: number;
  lastPlayed: number;
}

export function fetchLibrary(steamId: string): Promise<LibraryGame[]> {
  return getJSON(`/api/web/library/${encodeURIComponent(steamId)}`);
}

export async function searchGames(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`/api/steam/search?q=${encodeURIComponent(q)}&limit=20`, {
    credentials: 'omit',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as SearchResult[];
  return Array.isArray(data) ? data : [];
}
