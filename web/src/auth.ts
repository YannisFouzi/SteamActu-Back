// Web auth: reuses the existing Steam OpenID flow (/auth/steam/*). Login opens
// a popup to Steam, polls /auth/steam/status until it succeeds, and stores the
// returned session token (the same token mobileSessionAuth validates) so write
// endpoints (follow/unfollow) work.

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

interface StartResponse {
  authToken: string;
  authUrl: string;
}

interface StatusResponse {
  status: 'pending' | 'succeeded' | 'expired';
  steamId?: string;
  sessionToken?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Opens the Steam login popup and resolves once the OpenID flow completes.
export async function login(): Promise<Session> {
  const startRes = await fetch('/auth/steam/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'web' }),
  });
  if (!startRes.ok) {
    throw new Error(`auth start failed: HTTP ${startRes.status}`);
  }
  const { authToken, authUrl } = (await startRes.json()) as StartResponse;

  // Login popup is the standard OAuth pattern — distinct from content
  // navigation (which stays in the main window).
  const popup = window.open(authUrl, 'steam_login', 'width=820,height=680');

  const deadline = Date.now() + 3 * 60 * 1000; // 3 min
  while (Date.now() < deadline) {
    await delay(2000);
    const statusRes = await fetch(
      `/auth/steam/status/${encodeURIComponent(authToken)}`,
    );
    if (!statusRes.ok) continue;
    const status = (await statusRes.json()) as StatusResponse;

    if (status.status === 'succeeded' && status.sessionToken && status.steamId) {
      const session: Session = {
        token: status.sessionToken,
        steamId: status.steamId,
      };
      setSession(session);
      try {
        popup?.close();
      } catch {
        /* popup may already be closed */
      }
      return session;
    }
    if (status.status === 'expired') {
      throw new Error('auth expired');
    }
  }
  throw new Error('auth timed out');
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
