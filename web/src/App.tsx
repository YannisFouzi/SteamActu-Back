import { useEffect, useState } from 'react';
import { CONTEXT, fetchProfile, type WebProfile } from './api';
import { ensureSession, getSession, type Session } from './auth';
import { maskSteamId } from './format';
import ActuTab from './tabs/ActuTab';
import SuivreTab from './tabs/SuivreTab';
import CompteTab from './tabs/CompteTab';

type Tab = 'actu' | 'suivre' | 'compte';

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; profile: WebProfile };

export default function App() {
  const [tab, setTab] = useState<Tab>('actu');
  const [profile, setProfile] = useState<ProfileState>({ status: 'loading' });
  const [session, setSession] = useState<Session | null>(getSession());

  useEffect(() => {
    let cancelled = false;
    if (!/^\d{17}$/.test(CONTEXT.steamId)) {
      setProfile({ status: 'error', error: 'Invalid SteamID' });
      return;
    }

    // Zero-click auth: exchange the plugin-injected SteamID for a session
    // token so follow/unfollow work without a Steam re-login.
    ensureSession(CONTEXT.steamId)
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch((err: unknown) => {
        console.error('[GameNews] auto-auth failed', err);
      });

    fetchProfile(CONTEXT.steamId)
      .then((p) => {
        if (!cancelled) setProfile({ status: 'ok', profile: p });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setProfile({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Writes are only allowed for your own account (backend requireSelf). With
  // zero-click auth the session SteamID always matches the injected one.
  const editable = session != null && session.steamId === CONTEXT.steamId;

  return (
    <div className="page">
      <header className="app-header">
        <h1>Game News</h1>
        <span className="meta">SteamID: {maskSteamId(CONTEXT.steamId)}</span>
      </header>

      <nav className="tabs">
        <button
          className={`tab ${tab === 'actu' ? 'active' : ''}`}
          onClick={() => setTab('actu')}
        >
          Actu
        </button>
        <button
          className={`tab ${tab === 'suivre' ? 'active' : ''}`}
          onClick={() => setTab('suivre')}
        >
          Suivre
        </button>
        <button
          className={`tab ${tab === 'compte' ? 'active' : ''}`}
          onClick={() => setTab('compte')}
        >
          Compte
        </button>
      </nav>

      {tab === 'actu' && <ActuTab />}

      {tab !== 'actu' && profile.status === 'loading' && (
        <div className="state">Loading profile…</div>
      )}
      {tab !== 'actu' && profile.status === 'error' && (
        <div className="state error">Failed to load profile — {profile.error}</div>
      )}
      {tab === 'suivre' && profile.status === 'ok' && (
        <SuivreTab profile={profile.profile} editable={editable} />
      )}
      {tab === 'compte' && profile.status === 'ok' && (
        <CompteTab profile={profile.profile} />
      )}

      <footer>gamenews.up.railway.app — web view</footer>
    </div>
  );
}
