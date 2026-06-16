import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CONTEXT,
  fetchLibrary,
  refreshAccount,
  type LibraryGame,
  type WebProfile,
} from '../api';
import { type FollowState } from '../useFollow';
import { checkVisibility, checkWishlistVisibility } from '../auth';
import { sortLibrary, sortWishlist, type LibrarySort, type WishlistSort } from '../sort';
import { useT } from '../i18n';
import { openExternal } from '../format';
import SubTabs, { type SubTab } from '../components/SubTabs';
import SortOptions, { type SortOption } from '../components/SortOptions';
import GamesGrid from '../components/GamesGrid';
import LockedState from '../components/LockedState';
import InfoDialog from '../components/InfoDialog';
import UnifiedSearchView from '../components/UnifiedSearchView';

type Sub = 'mes-jeux' | 'wishlist';

// Steam privacy settings — same destination as the mobile EmptyStateMessage
// "Ouvrir les paramètres Steam" action.
const STEAM_PRIVACY_URL = 'https://steamcommunity.com/my/edit/settings';

interface VisibilityHint {
  gameDetailsVisible: boolean;
  gamesVisible: boolean;
  playtimeVisible: boolean;
}

type LibState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; games: LibraryGame[] };

export default function SuivreSection({
  profile,
  editable,
  follow,
  onAccountRefreshed,
}: {
  profile: WebProfile | null;
  editable: boolean;
  follow: FollowState;
  // Re-fetch du profil parent (wishlist + jeux suivis) après un rescan admin.
  onAccountRefreshed?: () => void;
}) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [sub, setSub] = useState<Sub>('mes-jeux');
  const [libSort, setLibSort] = useState<LibrarySort>('lastTwoWeeks');
  const [wishSort, setWishSort] = useState<WishlistSort>('recent');
  const [lib, setLib] = useState<LibState>({ status: 'loading' });
  // Admin-only manual re-scan (library + Steam Family + wishlist), same as the
  // cron. Visible only when the server flags this SteamID as admin.
  const [adminState, setAdminState] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  );
  const isAdmin = Boolean(profile?.account.isAdmin);

  // Recharge la bibliothèque (Mes jeux). Réutilisé au montage ET après un rescan
  // admin — on garde l'ancienne donnée affichée jusqu'à l'arrivée de la nouvelle.
  const loadLibrary = useCallback(
    () =>
      fetchLibrary(CONTEXT.steamId)
        .then((games) => setLib({ status: 'ok', games }))
        .catch((err: unknown) =>
          setLib({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          }),
        ),
    [],
  );

  // "Vérifier mon profil" : état du locked-state (mirror du visibilityHint mobile)
  // + dialog de résultat. Le hint pilote le checkmark de la 1re étape.
  const [visibilityHint, setVisibilityHint] = useState<VisibilityHint>({
    gameDetailsVisible: false,
    gamesVisible: false,
    playtimeVisible: false,
  });
  const [checking, setChecking] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(
    null,
  );

  // Mes jeux : teste la visibilité, met à jour le hint, affiche le résultat et
  // recharge la bibliothèque si elle est devenue publique. Calque de la logique
  // checkVisibility de MyGamesScreen.js (mobile).
  const runCheckVisibility = useCallback(async () => {
    if (checking) {
      return;
    }
    setChecking(true);
    try {
      const data = await checkVisibility();
      const gamesVisible = data.gamesVisible === true || data.visible === true;
      const gameDetailsVisible =
        gamesVisible ||
        data.gameDetailsVisible === true ||
        data.wishlistVisible === true;
      setVisibilityHint({
        gameDetailsVisible,
        gamesVisible,
        playtimeVisible: data.playtimeVisible === true,
      });
      if (gamesVisible) {
        setDialog({
          title: t('common.success'),
          message: t('games.checkVisibilitySuccess'),
        });
        await loadLibrary();
        onAccountRefreshed?.();
      } else if (gameDetailsVisible) {
        setDialog({
          title: t('common.info'),
          message: t('games.checkVisibilityPlaytimeStillPrivate'),
        });
      } else {
        setDialog({
          title: t('common.info'),
          message: t('games.checkVisibilityStillPrivate'),
        });
      }
    } catch {
      setDialog({
        title: t('common.info'),
        message: t('games.checkVisibilityStillPrivate'),
      });
    } finally {
      setChecking(false);
    }
  }, [checking, loadLibrary, onAccountRefreshed, t]);

  // Wishlist : calque de la logique checkVisibility de WishlistScreen.js (mobile).
  const runCheckWishlistVisibility = useCallback(async () => {
    if (checking) {
      return;
    }
    setChecking(true);
    try {
      const data = await checkWishlistVisibility();
      if (data.visible) {
        const gamesAlsoVisible = data.gamesVisible === true;
        setVisibilityHint({
          gameDetailsVisible: true,
          gamesVisible: gamesAlsoVisible,
          playtimeVisible: data.playtimeVisible === true,
        });
        setDialog({
          title: t('common.success'),
          message: t('games.checkVisibilityWishlistSuccess'),
        });
        onAccountRefreshed?.(); // re-fetch du profil parent (wishlist)
        if (gamesAlsoVisible) {
          await loadLibrary();
        }
      } else {
        setDialog({
          title: t('common.info'),
          message: t('games.checkVisibilityWishlistStillPrivate'),
        });
      }
    } catch {
      setDialog({
        title: t('common.info'),
        message: t('games.checkVisibilityWishlistStillPrivate'),
      });
    } finally {
      setChecking(false);
    }
  }, [checking, loadLibrary, onAccountRefreshed, t]);

  const runAdminRefresh = () => {
    if (adminState === 'loading') {
      return;
    }
    setAdminState('loading');
    refreshAccount(CONTEXT.steamId)
      .then(() => {
        // Re-fetch en place (PAS de window.location.reload, qui réinitialisait le
        // SPA sur l'onglet "Actu" par défaut). On reste sur "Suivre".
        onAccountRefreshed?.(); // profil parent : wishlist + jeux suivis
        return loadLibrary(); // bibliothèque locale
      })
      .then(() => setAdminState('idle'))
      .catch(() => setAdminState('error'));
  };

  const TABS: ReadonlyArray<SubTab<Sub>> = [
    { key: 'mes-jeux', label: t('nav.myGames') },
    { key: 'wishlist', label: t('nav.wishlist') },
  ];

  const LIB_SORTS: ReadonlyArray<SortOption<LibrarySort>> = [
    { value: 'lastTwoWeeks', label: t('games.recentTwoWeeks') },
    { value: 'default', label: t('games.sortAZ') },
    { value: 'mostPlayed', label: t('games.topPlayed') },
  ];

  const WISHLIST_SORTS: ReadonlyArray<SortOption<WishlistSort>> = [
    { value: 'recent', label: t('games.recents') },
    { value: 'alphabetical', label: t('games.sortAZ') },
  ];

  // Library is needed both by Mes jeux and by the unified search ("Dans mes
  // jeux" section), so load it once when the section mounts.
  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  const libraryGames = lib.status === 'ok' ? lib.games : [];
  const wishlist = profile?.wishlist ?? [];

  const mesJeuxItems = useMemo(
    () =>
      sortLibrary(libraryGames, libSort).map((g) => ({
        appId: g.appId,
        name: g.name,
        image: g.header_image,
        familyShared: g.isFamilyShared,
      })),
    [libraryGames, libSort],
  );

  const isSearching = query.trim().length > 0;

  return (
    <div>
      <input
        className="search-input"
        type="text"
        placeholder={t('search.unifiedPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {isSearching ? (
        <UnifiedSearchView
          query={query}
          library={libraryGames}
          wishlist={wishlist}
          editable={editable}
          follow={follow}
        />
      ) : (
        <>
          {isAdmin && (
            <button
              type="button"
              className="admin-rescan-btn"
              onClick={runAdminRefresh}
              disabled={adminState === 'loading'}>
              {adminState === 'loading'
                ? 'Scan en cours…'
                : '↻ Rescan biblio + Famille + wishlist'}
            </button>
          )}
          {adminState === 'error' && (
            <div className="state error">Échec du scan — réessaie.</div>
          )}

          <SubTabs tabs={TABS} active={sub} onChange={setSub} />

          {sub === 'mes-jeux' && (
            <>
              {lib.status === 'loading' && (
                <div className="state">{t('games.loadingGames')}</div>
              )}
              {lib.status === 'error' && (
                <div className="state error">
                  {t('common.error')} — {lib.error}
                </div>
              )}
              {lib.status === 'ok' &&
                (mesJeuxItems.length === 0 ? (
                  <LockedState
                    title={t('games.libraryEmptyTitle')}
                    instructions={[
                      {
                        text: t('games.privacyGameDetailsStep'),
                        completed: visibilityHint.gameDetailsVisible,
                      },
                      { text: t('games.privacyPlaytimeStep') },
                    ]}
                    actionText={t('games.libraryEmptyPrivacyAction')}
                    onAction={() => openExternal(STEAM_PRIVACY_URL)}
                    secondaryActionText={t('games.checkVisibilityAction')}
                    onSecondaryAction={runCheckVisibility}
                    secondaryLoading={checking}
                  />
                ) : (
                  <>
                    <SortOptions
                      options={LIB_SORTS}
                      selected={libSort}
                      onSelect={setLibSort}
                    />
                    <GamesGrid
                      items={mesJeuxItems}
                      editable={editable}
                      follow={follow}
                      emptyLabel={t('games.libraryEmptyShortText')}
                    />
                  </>
                ))}
            </>
          )}

          {sub === 'wishlist' &&
            (profile == null ? (
              <div className="state">{t('common.loading')}</div>
            ) : wishlist.length === 0 ? (
              <LockedState
                title={t('games.wishlistEmptyTitle')}
                instructions={[{ text: t('games.privacyGameDetailsStep') }]}
                actionText={t('games.wishlistEmptyPrivacyAction')}
                onAction={() => openExternal(STEAM_PRIVACY_URL)}
                secondaryActionText={t('games.checkVisibilityAction')}
                onSecondaryAction={runCheckWishlistVisibility}
                secondaryLoading={checking}
              />
            ) : (
              <>
                <SortOptions
                  options={WISHLIST_SORTS}
                  selected={wishSort}
                  onSelect={setWishSort}
                />
                <GamesGrid
                  items={sortWishlist(wishlist, wishSort).map((g) => ({
                    appId: g.appId,
                    name: g.name,
                    image: g.header_image,
                  }))}
                  editable={editable}
                  follow={follow}
                  emptyLabel={t('games.wishlistEmptyShortText')}
                />
              </>
            ))}
        </>
      )}

      {dialog && (
        <InfoDialog
          title={dialog.title}
          message={dialog.message}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
