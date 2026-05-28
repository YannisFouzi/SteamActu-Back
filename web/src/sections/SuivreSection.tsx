import { useEffect, useMemo, useState } from 'react';
import { CONTEXT, fetchLibrary, type LibraryGame, type WebProfile } from '../api';
import { type FollowState } from '../useFollow';
import { sortLibrary, type LibrarySort } from '../sort';
import SubTabs, { type SubTab } from '../components/SubTabs';
import SortOptions, { type SortOption } from '../components/SortOptions';
import GamesGrid from '../components/GamesGrid';
import UnifiedSearchView from '../components/UnifiedSearchView';

type Sub = 'mes-jeux' | 'wishlist';
const TABS: ReadonlyArray<SubTab<Sub>> = [
  { key: 'mes-jeux', label: 'Mes jeux' },
  { key: 'wishlist', label: 'Wishlist' },
];

const LIB_SORTS: ReadonlyArray<SortOption<LibrarySort>> = [
  { value: 'lastTwoWeeks', label: 'Top récents' },
  { value: 'default', label: 'A-Z' },
  { value: 'mostPlayed', label: 'Plus joués' },
];

type LibState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ok'; games: LibraryGame[] };

export default function SuivreSection({
  profile,
  editable,
  follow,
}: {
  profile: WebProfile | null;
  editable: boolean;
  follow: FollowState;
}) {
  const [query, setQuery] = useState('');
  const [sub, setSub] = useState<Sub>('mes-jeux');
  const [libSort, setLibSort] = useState<LibrarySort>('lastTwoWeeks');
  const [lib, setLib] = useState<LibState>({ status: 'loading' });

  // Library is needed both by Mes jeux and by the unified search ("Dans mes
  // jeux" section), so load it once when the section mounts.
  useEffect(() => {
    let cancelled = false;
    fetchLibrary(CONTEXT.steamId)
      .then((games) => {
        if (!cancelled) setLib({ status: 'ok', games });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLib({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const libraryGames = lib.status === 'ok' ? lib.games : [];
  const wishlist = profile?.wishlist ?? [];

  const mesJeuxItems = useMemo(
    () =>
      sortLibrary(libraryGames, libSort).map((g) => ({
        appId: g.appId,
        name: g.name,
        image: g.header_image,
      })),
    [libraryGames, libSort],
  );

  const isSearching = query.trim().length > 0;

  return (
    <div>
      <input
        className="search-input"
        type="text"
        placeholder="Rechercher un jeu..."
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
          <SubTabs tabs={TABS} active={sub} onChange={setSub} />

          {sub === 'mes-jeux' && (
            <>
              {lib.status === 'loading' && (
                <div className="state">Chargement de ta bibliothèque…</div>
              )}
              {lib.status === 'error' && (
                <div className="state error">
                  Échec du chargement — {lib.error}
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
                    emptyLabel="Ta bibliothèque Steam semble vide (profil privé ?)."
                  />
                </>
              )}
            </>
          )}

          {sub === 'wishlist' &&
            (profile == null ? (
              <div className="state">Chargement…</div>
            ) : (
              <GamesGrid
                items={wishlist.map((g) => ({
                  appId: g.appId,
                  name: g.name,
                  image: g.header_image,
                }))}
                editable={editable}
                follow={follow}
                emptyLabel="Ta wishlist est vide."
              />
            ))}
        </>
      )}
    </div>
  );
}
