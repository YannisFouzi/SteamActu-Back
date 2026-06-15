import { useEffect, useMemo, useState } from 'react';
import {
  CONTEXT,
  fetchProfile,
  HttpError,
  INJECTED_SESSION,
  PAIR_SECRET,
  type WebProfile,
} from './api';
import {
  getSession,
  logout,
  startSteamLogin,
  updateLanguage,
  updateNotifications,
  type Session,
} from './auth';
import { useFollow } from './useFollow';
import { useUnfollowGuard } from './useUnfollowGuard';
import { LangContext, detectBrowserLanguage, makeT } from './i18n';
import ActuSection from './sections/ActuSection';
import SuivreSection from './sections/SuivreSection';
import CompteTab from './tabs/CompteTab';
import ConfirmDialog from './components/ConfirmDialog';
import {
  GameControllerIcon,
  NewspaperIcon,
  PersonCircleIcon,
} from './components/Icons';

type Tab = 'actu' | 'suivre' | 'compte';

type ProfileState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; profile: WebProfile };

export default function App() {
  const [tab, setTab] = useState<Tab>('actu');
  const [profile, setProfile] = useState<ProfileState>({ status: 'loading' });
  // Bumpé après un rescan admin pour re-fetch le profil (wishlist + jeux suivis)
  // en place, sans recharger toute la page (qui repartait sur l'onglet "Actu").
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [session] = useState<Session | null>(getSession());
  const [confirmUnfollow, setConfirmUnfollow] = useState(true);
  const [deleted, setDeleted] = useState(false);
  // First launch (not yet auto-detected): show the client language right away;
  // afterwards the stored account language wins (applied once the profile loads).
  const [lang, setLang] = useState<string>(
    localStorage.getItem('gn_lang_synced')
      ? CONTEXT.language || detectBrowserLanguage()
      : detectBrowserLanguage(),
  );

  const t = useMemo(() => makeT(lang), [lang]);

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
          // Language, like the mobile app: on first contact adopt the client
          // language (Steam/browser) and persist it so the display AND the news
          // filtering follow; afterwards respect the stored/manually-chosen one.
          let synced = false;
          try {
            synced = Boolean(localStorage.getItem('gn_lang_synced'));
          } catch {
            /* ignore */
          }
          if (synced) {
            if (p.language) setLang(p.language);
          } else {
            const detected = detectBrowserLanguage();
            if (detected && detected !== p.language) {
              setLang(detected);
              updateLanguage(detected).catch((err: unknown) =>
                console.error('[GameNews] language autodetect save failed', err),
              );
            } else if (p.language) {
              setLang(p.language);
            }
            try {
              localStorage.setItem('gn_lang_synced', '1');
            } catch {
              /* ignore */
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Gated account (paired): in the browser/extension surface (no plugin
        // secret) a 401 means we need a verified session → go through Steam
        // OpenID. The Millennium plugin always carries the secret, so it never
        // lands here. A stranger without the Steam session can't pass OpenID.
        if (
          err instanceof HttpError &&
          err.status === 401 &&
          !PAIR_SECRET &&
          !session &&
          !INJECTED_SESSION
        ) {
          // No credential at all → standalone web tab: redirect through Steam
          // OpenID (near-zero-click). The plugin (secret) and the extension
          // (injected session) carry their own credential and never land here.
          void startSteamLogin().catch(() => {
            setProfile({ status: 'error', error: 'Authentification requise' });
          });
          return;
        }
        setProfile({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [authed, refreshNonce]);

  // Re-fetch the profile when the tab/feed regains focus, so a follow made on
  // ANOTHER surface (a Steam store page bell, the extension/plugin) shows up
  // without a manual reload. Bumping refreshNonce re-runs the loader above,
  // which never flips back to a loading state → no flash. (Web twin of the
  // mobile followVersion poll.)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setRefreshNonce((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  // Writes go through public-by-SteamID endpoints, so the feed is editable even
  // without a verified session (we're inside the authenticated Steam client).
  // Only account deletion still needs a real session — gated via `authed`.
  const editable = true;

  const profileData = profile.status === 'ok' ? profile.profile : null;

  const seedIds = useMemo(
    () => (profileData ? profileData.followedGames.map((g) => g.appId) : []),
    [profileData],
  );
  // notified ⊆ followed : un jeu est notifié sauf si notifications === false
  // (suivi silencieux). Les entrées legacy sans le champ restent notifiées.
  const seedNotified = useMemo(
    () =>
      profileData
        ? profileData.followedGames
            .filter((g) => g.notifications !== false)
            .map((g) => g.appId)
        : [],
    [profileData],
  );
  const baseFollow = useFollow(seedIds, seedNotified);

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
        <div className="state">{t('settings.accountDeleted')}</div>
      </div>
    );
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
    <div className="page">
      <nav className="tabs">
        <button
          className={`tab ${tab === 'actu' ? 'active' : ''}`}
          onClick={() => setTab('actu')}
        >
          <NewspaperIcon size={24} />
          <span>{t('nav.news')}</span>
        </button>
        <button
          className={`tab ${tab === 'suivre' ? 'active' : ''}`}
          onClick={() => setTab('suivre')}
        >
          <GameControllerIcon size={24} />
          <span>{t('nav.followGame')}</span>
        </button>
        <button
          className={`tab ${tab === 'compte' ? 'active' : ''}`}
          onClick={() => setTab('compte')}
        >
          <PersonCircleIcon size={24} />
          <span>{t('nav.account')}</span>
        </button>
      </nav>

      {tab === 'actu' && (
        <ActuSection
          profile={profileData}
          profileLoading={profile.status === 'loading'}
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
          onAccountRefreshed={() => setRefreshNonce((n) => n + 1)}
        />
      )}
      {tab === 'compte' &&
        (profile.status === 'error' ? (
          <div className="state error">{t('common.error')} — {profile.error}</div>
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
          <div className="state">{t('common.loading')}</div>
        ))}

      {guard.pending && (
        <ConfirmDialog
          title={t('settings.confirmUnfollowTitle')}
          message={t('settings.confirmUnfollowMessage', { game: guard.pending.name })}
          confirmLabel={t('settings.confirmUnfollowConfirm')}
          destructive
          checkboxLabel={t('settings.confirmUnfollowCheckbox')}
          onConfirm={guard.confirm}
          onCancel={guard.cancel}
        />
      )}
    </div>
    </LangContext.Provider>
  );
}
