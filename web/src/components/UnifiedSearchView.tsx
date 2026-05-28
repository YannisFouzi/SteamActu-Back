import { useEffect, useMemo, useRef, useState } from 'react';
import { searchGames, type LibraryGame, type SearchResult, type WishlistGame } from '../api';
import { type FollowState } from '../useFollow';
import GamesGrid, { type GridItem } from './GamesGrid';

const STORE_MIN_LENGTH = 3;

// Mirrors the mobile UnifiedSearchView: three deduped sections (Mes jeux >
// Wishlist > Boutique). Store search runs only at >= 3 characters.
export default function UnifiedSearchView({
  query,
  library,
  wishlist,
  editable,
  follow,
}: {
  query: string;
  library: LibraryGame[];
  wishlist: WishlistGame[];
  editable: boolean;
  follow: FollowState;
}) {
  const [store, setStore] = useState<SearchResult[]>([]);
  const [storeLoading, setStoreLoading] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);

  const q = query.trim().toLowerCase();

  useEffect(() => {
    window.clearTimeout(debounceRef.current);
    if (query.trim().length < STORE_MIN_LENGTH) {
      setStore([]);
      setStoreLoading(false);
      return;
    }
    setStoreLoading(true);
    debounceRef.current = window.setTimeout(() => {
      searchGames(query.trim())
        .then((r) => setStore(r))
        .catch(() => setStore([]))
        .finally(() => setStoreLoading(false));
    }, 350);
    return () => window.clearTimeout(debounceRef.current);
  }, [query]);

  const { myGames, wish, storeItems } = useMemo(() => {
    const seen = new Set<string>();

    const myGames: GridItem[] = library
      .filter((g) => g.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))
      .map((g) => {
        seen.add(g.appId);
        return { appId: g.appId, name: g.name, image: g.header_image };
      });

    const wish: GridItem[] = wishlist
      .filter((g) => g.name.toLowerCase().includes(q) && !seen.has(g.appId))
      .map((g) => {
        seen.add(g.appId);
        return { appId: g.appId, name: g.name, image: g.header_image };
      });

    const storeItems: GridItem[] = store
      .filter((g) => !seen.has(String(g.appid)))
      .map((g) => ({
        appId: String(g.appid),
        name: g.name,
        image: g.tiny_image || g.header_image,
      }));

    return { myGames, wish, storeItems };
  }, [library, wishlist, store, q]);

  const storeTooShort = query.trim().length > 0 && query.trim().length < STORE_MIN_LENGTH;

  return (
    <div>
      {myGames.length > 0 && (
        <>
          <div className="section-title">Dans mes jeux</div>
          <GamesGrid items={myGames} editable={editable} follow={follow} emptyLabel="" />
        </>
      )}

      {wish.length > 0 && (
        <>
          <div className="section-title">Dans la wishlist</div>
          <GamesGrid items={wish} editable={editable} follow={follow} emptyLabel="" />
        </>
      )}

      {!storeTooShort && (storeItems.length > 0 || storeLoading) && (
        <>
          <div className="section-title">
            Sur la boutique Steam {storeLoading ? '· recherche…' : ''}
          </div>
          {storeItems.length > 0 && (
            <GamesGrid items={storeItems} editable={editable} follow={follow} emptyLabel="" />
          )}
        </>
      )}

      {myGames.length === 0 &&
        wish.length === 0 &&
        storeItems.length === 0 &&
        !storeLoading && <div className="state">Aucun résultat.</div>}
    </div>
  );
}
