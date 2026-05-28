import { useEffect, useState } from 'react';
import { CONTEXT, fetchLibrary, type LibraryGame, type WebProfile } from '../api';
import { type FollowState } from '../useFollow';
import SubTabs, { type SubTab } from '../components/SubTabs';
import GamesGrid from '../components/GamesGrid';
import RechercherTab from '../tabs/RechercherTab';

type Sub = 'mes-jeux' | 'wishlist' | 'rechercher';
const TABS: ReadonlyArray<SubTab<Sub>> = [
  { key: 'mes-jeux', label: 'Mes jeux' },
  { key: 'wishlist', label: 'Wishlist' },
  { key: 'rechercher', label: 'Rechercher' },
];

type LibState =
  | { status: 'idle' }
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
  const [sub, setSub] = useState<Sub>('mes-jeux');
  const [lib, setLib] = useState<LibState>({ status: 'idle' });

  // Lazy-load the library only when Mes jeux is first opened.
  useEffect(() => {
    if (sub !== 'mes-jeux' || lib.status !== 'idle') return;
    setLib({ status: 'loading' });
    fetchLibrary(CONTEXT.steamId)
      .then((games) => setLib({ status: 'ok', games }))
      .catch((err: unknown) =>
        setLib({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }),
      );
  }, [sub, lib.status]);

  const wishlistItems = (profile?.wishlist ?? []).map((g) => ({
    appId: g.appId,
    name: g.name,
    image: g.header_image,
  }));

  return (
    <div>
      <SubTabs tabs={TABS} active={sub} onChange={setSub} />

      {sub === 'mes-jeux' && (
        <>
          {lib.status === 'loading' && <div className="state">Loading your library…</div>}
          {lib.status === 'error' && (
            <div className="state error">Failed to load library — {lib.error}</div>
          )}
          {lib.status === 'ok' && (
            <GamesGrid
              items={lib.games.map((g) => ({
                appId: g.appId,
                name: g.name,
                image: g.header_image,
              }))}
              editable={editable}
              follow={follow}
              emptyLabel="Your Steam library looks empty (private profile?)."
            />
          )}
        </>
      )}

      {sub === 'wishlist' &&
        (profile == null ? (
          <div className="state">Loading…</div>
        ) : (
          <GamesGrid
            items={wishlistItems}
            editable={editable}
            follow={follow}
            emptyLabel="Your wishlist is empty."
          />
        ))}

      {sub === 'rechercher' && <RechercherTab editable={editable} follow={follow} />}
    </div>
  );
}
