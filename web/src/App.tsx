import { useEffect, useState } from 'react';
import { CONTEXT, fetchProfile, type WebProfile } from './api';
import { getSession, login, logout, type Session } from './auth';
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
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!/^\d{17}$/.test(CONTEXT.steamId)) {
      setProfile({ status: 'error', error: 'Invalid SteamID' });
      return;
    }
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

  // Writes are only allowed for your own account (backend requireSelf).
  const editable = session != null && session.steamId === CONTEXT.steamId;

  const handleLogin = () => {
    setAuthBusy(true);
    login()
      .then(setSession)
      .catch((err: unknown) => {
        console.error('[GameNews] login failed', err);
      })
      .finally(() => setAuthBusy(false));
  };

  const handleLogout = () => {
    logout();
    setSession(null);
  };

  return (
    <div className="page">
      <header className="app-header">
        <h1>Game News</h1>
        <div className="header-right">
          <span className="meta">SteamID: {maskSteamId(CONTEXT.steamId)}</span>
          {session ? (
            <button className="auth-btn" onClick={handleLogout}>
              Log out
            </button>
          ) : (
            <button className="auth-btn primary" onClick={handleLogin} disabled={authBusy}>
              {authBusy ? 'Connecting…' : 'Log in with Steam'}
            </button>
          )}
        </div>
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
