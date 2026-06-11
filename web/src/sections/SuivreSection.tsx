import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CONTEXT,
  fetchLibrary,
  refreshAccount,
  type LibraryGame,
  type WebProfile,
} from '../api';
import { type FollowState } from '../useFollow';
import { sortLibrary, sortWishlist, type LibrarySort, type WishlistSort } from '../sort';
import { useT } from '../i18n';
import SubTabs, { type SubTab } from '../components/SubTabs';
import SortOptions, { type SortOption } from '../components/SortOptions';
import GamesGrid from '../components/GamesGrid';
import UnifiedSearchView from '../components/UnifiedSearchView';

type Sub = 'mes-jeux' | 'wishlist';

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
              {lib.status === 'ok' && (
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
              )}
            </>
          )}

          {sub === 'wishlist' &&
            (profile == null ? (
              <div className="state">{t('common.loading')}</div>
            ) : (
              <>
                {wishlist.length > 0 && (
                  <SortOptions
                    options={WISHLIST_SORTS}
                    selected={wishSort}
                    onSelect={setWishSort}
                  />
                )}
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
    </div>
  );
}
