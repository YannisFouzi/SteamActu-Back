import { useEffect, useMemo, useState } from 'react';
import { CONTEXT, fetchProfile, type WebProfile } from './api';
import { ensureSession, getSession, type Session } from './auth';
import { useFollow } from './useFollow';
import ActuSection from './sections/ActuSection';
import SuivreSection from './sections/SuivreSection';
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

  const editable = session != null && session.steamId === CONTEXT.steamId;

  const profileData = profile.status === 'ok' ? profile.profile : null;

  const seedIds = useMemo(
    () => (profileData ? profileData.followedGames.map((g) => g.appId) : []),
    [profileData],
  );
  const follow = useFollow(seedIds);

  return (
    <div className="page">
      <header className="app-header">
        <h1>News</h1>
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
          Suivre un jeu
        </button>
        <button
          className={`tab ${tab === 'compte' ? 'active' : ''}`}
          onClick={() => setTab('compte')}
        >
          Mon compte
        </button>
      </nav>

      {tab === 'actu' && (
        <ActuSection profile={profileData} editable={editable} follow={follow} />
      )}
      {tab === 'suivre' && (
        <SuivreSection profile={profileData} editable={editable} follow={follow} />
      )}
      {tab === 'compte' &&
        (profile.status === 'error' ? (
          <div className="state error">Failed to load profile — {profile.error}</div>
        ) : profileData ? (
          <CompteTab profile={profileData} editable={editable} />
        ) : (
          <div className="state">Loading profile…</div>
        ))}
    </div>
  );
}
