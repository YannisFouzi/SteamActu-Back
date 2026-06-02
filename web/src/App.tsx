import { useEffect, useMemo, useState } from 'react';
import { CONTEXT, fetchProfile, type WebProfile } from './api';
import {
  getSession,
  logout,
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

  // The feed is read-only public data keyed by steamId (followed games, news,
  // wishlist are all public on steamcommunity), so we always render the content
  // straight from the public /api/web + /api/news endpoints — no login wall.
  // A verified session only unlocks editing (`editable`); without one the UI is
  // shown read-only. (This is what made the old in-Steam view feel login-free:
  // the data never needed auth, only the write actions do.)
  useEffect(() => {
    if (!/^\d{17}$/.test(CONTEXT.steamId)) {
      setProfile({ status: 'error', error: 'Invalid SteamID' });
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

  // Writes go through public-by-SteamID endpoints, so the feed is editable even
  // without a verified session (we're inside the authenticated Steam client).
  // Only account deletion still needs a real session — gated via `authed`.
  const editable = true;

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
            canDelete={authed}
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
