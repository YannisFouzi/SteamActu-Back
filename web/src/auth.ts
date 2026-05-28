// Web auth (Steam Desktop, zero-click): the Millennium plugin reads the
// SteamID locally from loginusers.vdf and injects it into the page. We exchange
// it for a session token via POST /api/web/session — no OpenID re-login, since
// the user is already logged into the Steam client. The token is the same one
// mobileSessionAuth validates, so write endpoints (follow/unfollow) work.

const STORAGE_KEY = 'gn_session';

export interface Session {
  token: string;
  steamId: string;
}

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (parsed.token && parsed.steamId) return parsed;
    return null;
  } catch {
    return null;
  }
}

function setSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function logout(): void {
  localStorage.removeItem(STORAGE_KEY);
}

interface SessionResponse {
  steamId: string;
  token: string;
}

// Exchanges the injected SteamID for a session token. Reuses a cached session
// for the same SteamID to avoid issuing a new token on every load.
export async function ensureSession(steamId: string): Promise<Session> {
  if (!/^\d{17}$/.test(steamId)) {
    throw new Error('invalid steamId');
  }
  const cached = getSession();
  if (cached && cached.steamId === steamId) {
    return cached;
  }
  const res = await fetch('/api/web/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ steamId }),
  });
  if (!res.ok) {
    throw new Error(`session failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as SessionResponse;
  const session: Session = { token: data.token, steamId: data.steamId };
  setSession(session);
  return session;
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
