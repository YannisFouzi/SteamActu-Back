// Web auth (Steam Desktop): the session is obtained ONLY through verified Steam
// OpenID. A SteamID is public, so we never mint a token from it alone — that let
// anyone with the /feed/<steamId> URL act on the account. Instead, when there's
// no valid cached session we send the window through /auth/steam/start
// (platform=web); the verified /auth/steam/return mints the token and writes it
// here. Since the Steam client is already logged in, this is near-zero-click; a
// stranger's browser can't pass OpenID as the owner, so it's blocked.

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

export async function followGame(
  appId: string,
  name: string,
  logoUrl: string,
): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('not authenticated');
  const res = await authedFetch(`/api/users/${session.steamId}/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, name, logoUrl }),
  });
  if (!res.ok) {
    throw new Error(`follow failed: HTTP ${res.status}`);
  }
}

export async function unfollowGame(appId: string): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('not authenticated');
  const res = await authedFetch(
    `/api/users/${session.steamId}/follow/${encodeURIComponent(appId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    throw new Error(`unfollow failed: HTTP ${res.status}`);
  }
}

export async function addFavorite(
  appId: string,
  newsId: string,
  newsDate: number,
): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('not authenticated');
  const res = await authedFetch(`/api/users/${session.steamId}/news-favorites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId, newsId, newsDate }),
  });
  if (!res.ok) {
    throw new Error(`favorite add failed: HTTP ${res.status}`);
  }
}

export async function removeFavorite(appId: string, newsId: string): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('not authenticated');
  const res = await authedFetch(
    `/api/users/${session.steamId}/news-favorites/${encodeURIComponent(
      appId,
    )}/${encodeURIComponent(newsId)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) {
    throw new Error(`favorite remove failed: HTTP ${res.status}`);
  }
}

export async function markNewsFeedSeen(seenAt: number): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('not authenticated');
  const res = await authedFetch(`/api/users/${session.steamId}/news/seen`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seenAt }),
  });
  if (!res.ok) {
    throw new Error(`mark seen failed: HTTP ${res.status}`);
  }
}

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
  const session = getSession();
  if (!session) throw new Error('not authenticated');
  const res = await authedFetch(`/api/users/${session.steamId}/notifications`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`settings update failed: HTTP ${res.status}`);
  }
}

export async function updateLanguage(language: string): Promise<void> {
  const session = getSession();
  if (!session) throw new Error('not authenticated');
  const res = await authedFetch(`/api/users/${session.steamId}/language`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language }),
  });
  if (!res.ok) {
    throw new Error(`language update failed: HTTP ${res.status}`);
  }
}
