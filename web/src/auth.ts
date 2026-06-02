// Web auth (Steam Desktop): the session is obtained ONLY through verified Steam
// OpenID. A SteamID is public, so we never mint a token from it alone — that let
// anyone with the /feed/<steamId> URL act on the account. Instead, when there's
// no valid cached session we send the window through /auth/steam/start
// (platform=web); the verified /auth/steam/return mints the token and writes it
// here. Since the Steam client is already logged in, this is near-zero-click; a
// stranger's browser can't pass OpenID as the owner, so it's blocked.

import { CONTEXT } from './api';

const STORAGE_KEY = 'gn_session';

export interface Session {
  token: string;
  steamId: string;
}

// Decode the base64url payload of a mobile session token and return its expiry
// (ms). Lets us treat an expired token as no session and re-auth proactively.
function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[0] || '';
    const json = JSON.parse(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };
    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed.token || !parsed.steamId) return null;
    const exp = tokenExpiry(parsed.token);
    if (exp !== null && Date.now() >= exp) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

interface StartResponse {
  authUrl: string;
}

// Sends the window to Steam OpenID. Returns a never-resolving promise because
// the page navigates away; the verified return handler redirects back to /feed
// with the session already stored.
export async function startSteamLogin(): Promise<never> {
  const res = await fetch('/auth/steam/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'web' }),
  });
  if (!res.ok) {
    throw new Error(`login start failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as StartResponse;
  window.location.assign(data.authUrl);
  return new Promise<never>(() => {});
}

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const session = getSession();
  if (!session) {
    throw new Error('not authenticated');
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${session.token}`);
  return fetch(url, { ...init, headers });
}

// Writes go through the public-by-SteamID /api/web endpoints (no session). The
// feed runs full-page inside the authenticated Steam Desktop client, where the
// user is already proven to be themselves; the same endpoints back the
// Millennium plugin's own follow calls. (Account deletion is the one exception —
// it stays session-only, see deleteAccount.)
const STEAM_ID = CONTEXT.steamId;

async function publicWrite(
  url: string,
  method: string,
  body?: unknown,
): Promise<void> {
  const init: RequestInit = { method, credentials: 'omit' };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`${method} ${url} failed: HTTP ${res.status}`);
  }
}

export async function followGame(
  appId: string,
  name: string,
  logoUrl: string,
): Promise<void> {
  await publicWrite('/api/web/follow', 'POST', {
    steamId: STEAM_ID,
    appId,
    name,
    logoUrl,
  });
}

export async function unfollowGame(appId: string): Promise<void> {
  await publicWrite(
    `/api/web/follow/${STEAM_ID}/${encodeURIComponent(appId)}`,
    'DELETE',
  );
}

export async function addFavorite(
  appId: string,
  newsId: string,
  newsDate: number,
): Promise<void> {
  await publicWrite(`/api/web/news-favorites/${STEAM_ID}`, 'POST', {
    appId,
    newsId,
    newsDate,
  });
}

export async function removeFavorite(appId: string, newsId: string): Promise<void> {
  await publicWrite(
    `/api/web/news-favorites/${STEAM_ID}/${encodeURIComponent(
      appId,
    )}/${encodeURIComponent(newsId)}`,
    'DELETE',
  );
}

export async function markNewsFeedSeen(seenAt: number): Promise<void> {
  await publicWrite(`/api/web/news-seen/${STEAM_ID}`, 'PUT', { seenAt });
}

// Destructive — kept session-only (verified Steam OpenID). Not exposed as a
// public-by-SteamID endpoint so a bare SteamID can never delete an account.
export async function deleteAccount(): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('not authenticated');
  const res = await authedFetch(`/api/users/${session.steamId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`delete account failed: HTTP ${res.status}`);
  }
}

export interface NotificationPatch {
  newsNotifications?: boolean;
  steamNotifications?: boolean;
  preferSteamWhenOpen?: boolean;
  confirmUnfollowGames?: boolean;
  libraryFollowMode?: string;
  wishlistFollowMode?: string;
}

export async function updateNotifications(patch: NotificationPatch): Promise<void> {
  await publicWrite(`/api/web/notifications/${STEAM_ID}`, 'PUT', patch);
}

export async function updateLanguage(language: string): Promise<void> {
  await publicWrite(`/api/web/language/${STEAM_ID}`, 'PUT', { language });
}
