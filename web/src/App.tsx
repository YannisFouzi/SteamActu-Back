import { useEffect, useMemo, useState } from 'react';
import { CONTEXT, fetchProfile, type WebProfile } from './api';
import {
  getSession,
  logout,
  startSteamLogin,
  updateNotifications,
  type Session,
} from './auth';
import { useFollow } from './useFollow';
import { useUnfollowGuard } from './useUnfollowGuard';
import ActuSection from './sections/ActuSection';
import SuivreSection from './sections/SuivreSection';
import CompteTab from './tabs/CompteTab';
import ConfirmDialog from './components/ConfirmDialog';

type Tab = 'actu' | 'suivre' | 'compte';

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; profile: WebProfile };

export default function App() {
  const [tab, setTab] = useState<Tab>('actu');
  const [profile, setProfile] = useState<ProfileState>({ status: 'loading' });
  const [session] = useState<Session | null>(getSession());
  const [confirmUnfollow, setConfirmUnfollow] = useState(true);
  const [deleted, setDeleted] = useState(false);

  const authed = session != null && session.steamId === CONTEXT.steamId;

  // Require a verified Steam OpenID session to view the account. With no valid
  // session, send the window to Steam OpenID (near-zero-click when the Steam
  // client is logged in) instead of rendering anyone's account from the URL.
  useEffect(() => {
    if (!/^\d{17}$/.test(CONTEXT.steamId)) {
      setProfile({ status: 'error', error: 'Invalid SteamID' });
      return;
    }
    if (!authed) {
      startSteamLogin().catch((err: unknown) => {
        console.error('[GameNews] steam login start failed', err);
      });
      return;
    }

    let cancelled = false;
    fetchProfile(CONTEXT.steamId)
      .then((p) => {
        if (!cancelled) {
          setProfile({ status: 'ok', profile: p });
          setConfirmUnfollow(p.account.confirmUnfollowGames);
        }
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
  }, [authed]);

  const editable = authed;

  const profileData = profile.status === 'ok' ? profile.profile : null;

  const seedIds = useMemo(
    () => (profileData ? profileData.followedGames.map((g) => g.appId) : []),
    [profileData],
  );
  const baseFollow = useFollow(seedIds);

  const persistConfirmUnfollow = (next: boolean) => {
    if (!editable) return;
    setConfirmUnfollow(next);
    updateNotifications({ confirmUnfollowGames: next }).catch((err: unknown) => {
      console.error('[GameNews] confirmUnfollow save failed', err);
      setConfirmUnfollow(!next);
    });
  };

  const guard = useUnfollowGuard(baseFollow, confirmUnfollow, () =>
    persistConfirmUnfollow(false),
  );

  if (deleted) {
    return (
      <div className="page">
        <div className="state">Votre compte a été supprimé.</div>
      </div>
    );
  }

  // Not authenticated: the window is being sent to Steam OpenID. Show a brief
  // connecting state instead of rendering any account data.
  if (!authed) {
    return (
      <div className="page">
        <header className="app-header">
          <h1>News</h1>
        </header>
        <div className="state">Connexion à Steam…</div>
      </div>
    );
  }

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
        <ActuSection
          profile={profileData}
          editable={editable}
          follow={guard.follow}
          onNavigateFollow={() => setTab('suivre')}
        />
      )}
      {tab === 'suivre' && (
        <SuivreSection
          profile={profileData}
          editable={editable}
          follow={guard.follow}
        />
      )}
      {tab === 'compte' &&
        (profile.status === 'error' ? (
          <div className="state error">Failed to load profile — {profile.error}</div>
        ) : profileData ? (
          <CompteTab
            profile={profileData}
            editable={editable}
            confirmUnfollow={confirmUnfollow}
            onConfirmUnfollowChange={persistConfirmUnfollow}
            onAccountDeleted={() => {
              logout();
              setDeleted(true);
            }}
          />
        ) : (
          <div className="state">Loading profile…</div>
        ))}

      {guard.pending && (
        <ConfirmDialog
          title="Ne plus suivre ce jeu ?"
          message={`Vous ne recevrez plus d'actualités pour « ${guard.pending.name} ».`}
          confirmLabel="Ne plus suivre"
          destructive
          checkboxLabel="Ne plus me demander pour les prochains désabonnements"
          onConfirm={guard.confirm}
          onCancel={guard.cancel}
        />
      )}
    </div>
  );
}
