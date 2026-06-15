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

// Per-install pairing secret, passed by the Millennium plugin via the URL hash
// (#gn_secret=…). When present, the feed's sensitive reads require it server-side
// (X-GN-Secret), so the page can't be viewed publicly with just the SteamID URL.
// We read it once then strip the hash so it isn't persisted/visible.
function readPairSecret(): string {
  try {
    const m = window.location.hash.match(/(?:^|[#&])gn_secret=([^&]+)/);
    const secret = m && m[1] ? decodeURIComponent(m[1]) : '';
    if (secret) {
      try {
        sessionStorage.setItem('gn_secret', secret);
      } catch {
        /* ignore */
      }
      // Strip the secret from the visible hash.
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return secret;
    }
    return sessionStorage.getItem('gn_secret') ?? '';
  } catch {
    return '';
  }
}

export const PAIR_SECRET = readPairSecret();

// Session token injected by the Chrome extension via the URL hash (#gn_session=…).
// The extension obtains it through Steam OpenID (in a popup) and hands it here
// because the embedded iframe's localStorage is PARTITIONED by Chrome — it can't
// read a session written by the top-level login window. Read once, cache in
// sessionStorage, strip the hash. Used as the Bearer credential on gated reads.
function readInjectedSession(): string {
  try {
    const m = window.location.hash.match(/(?:^|[#&])gn_session=([^&]+)/);
    const token = m && m[1] ? decodeURIComponent(m[1]) : '';
    if (token) {
      try {
        sessionStorage.setItem('gn_injected_session', token);
      } catch {
        /* ignore */
      }
      history.replaceState(null, '', window.location.pathname + window.location.search);
      return token;
    }
    return sessionStorage.getItem('gn_injected_session') ?? '';
  } catch {
    return '';
  }
}

export const INJECTED_SESSION = readInjectedSession();

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
    summary?: string;
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
  // false = suivi silencieux (bouton +) : dans le fil, sans notifications.
  // Absent/true = notifié (cloche). Exposé par followedGamesDetailsService.
  notifications?: boolean;
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
    isAdmin: boolean;
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

// Reads the cached session token directly from localStorage (avoids a circular
// import with auth.ts). Used to authenticate gated reads in the browser/extension
// surface (the Millennium plugin uses the pairing secret instead).
function sessionToken(): string {
  // Extension: the token injected via the URL hash wins (partitioned localStorage
  // can't be shared with the login popup). Standalone web: the OpenID return
  // stored it in localStorage.
  if (INJECTED_SESSION) {
    return INJECTED_SESSION;
  }
  try {
    const raw = localStorage.getItem('gn_session');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { token?: string };
    return parsed.token ?? '';
  } catch {
    return '';
  }
}

export class HttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

// Identity proof attached to every gated read AND every state-changing write:
// the plugin's per-install pairing secret (X-GN-Secret) and/or the browser/
// extension OpenID Bearer. The backend accepts either; a bare SteamID is never
// enough anymore (see middleware/webPairSecret.js > requireWebAuth).
export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (PAIR_SECRET) {
    headers['X-GN-Secret'] = PAIR_SECRET;
  }
  const token = sessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function getJSON<T>(url: string): Promise<T> {
  const headers = authHeaders();
  const res = await fetch(url, { credentials: 'omit', headers });
  if (!res.ok) {
    throw new HttpError(res.status);
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

// Same auth as getJSON (pairing secret and/or Bearer), POST with no body.
async function postAction(url: string): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'omit',
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new HttpError(res.status);
  }
}

// Admin-only: manual library + Steam Family + wishlist re-sync (server runs the
// same per-user sync as the cron). Gated server-side by secret + ADMIN_STEAM_IDS.
export function refreshAccount(steamId: string): Promise<void> {
  return postAction(`/api/web/admin/refresh/${encodeURIComponent(steamId)}`);
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
