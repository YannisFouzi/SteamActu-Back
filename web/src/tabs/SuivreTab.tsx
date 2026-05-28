import { useMemo, useState } from 'react';
import { type WebProfile } from '../api';
import { type FollowState } from '../useFollow';
import GameRow from '../components/GameRow';

interface Item {
  appId: string;
  name: string;
  image: string;
}

export default function SuivreTab({
  profile,
  editable,
  follow,
}: {
  profile: WebProfile;
  editable: boolean;
  follow: FollowState;
}) {
  const [filter, setFilter] = useState('');

  const followedList: Item[] = useMemo(
    () =>
      profile.followedGames.map((g) => ({
        appId: g.appId,
        name: g.name,
        image: g.imageUrl || g.header_image,
      })),
    [profile.followedGames],
  );
  const wishlistList: Item[] = useMemo(
    () =>
      profile.wishlist.map((g) => ({
        appId: g.appId,
        name: g.name,
        image: g.header_image,
      })),
    [profile.wishlist],
  );

  const q = filter.trim().toLowerCase();
  const match = (item: Item) => q === '' || item.name.toLowerCase().includes(q);
  const followedShown = followedList.filter(match);
  const wishlistShown = wishlistList.filter(match);

  const renderRow = (item: Item) => (
    <GameRow
      key={item.appId}
      appId={item.appId}
      name={item.name}
      image={item.image}
      editable={editable}
      following={follow.followed.has(item.appId)}
      busy={follow.busy.has(item.appId)}
      onToggle={() => follow.toggle(item.appId, item.name, item.image)}
    />
  );

  return (
    <div>
      {!editable && <div className="hint">Connecting your Steam account…</div>}

      <input
        className="search-input"
        type="text"
        placeholder="Filter your games…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      <div className="section-title">
        Followed games ({followedShown.length}
        {q ? `/${followedList.length}` : ''})
      </div>
      {followedShown.length === 0 ? (
        <div className="state">
          {q ? 'No followed game matches.' : "You don't follow any game yet."}
        </div>
      ) : (
        <div className="games-grid">{followedShown.map(renderRow)}</div>
      )}

      <div className="section-title">
        Wishlist ({wishlistShown.length}
        {q ? `/${wishlistList.length}` : ''})
      </div>
      {wishlistShown.length === 0 ? (
        <div className="state">
          {q ? 'No wishlist game matches.' : 'Your wishlist is empty.'}
        </div>
      ) : (
        <div className="games-grid">{wishlistShown.map(renderRow)}</div>
      )}
    </div>
  );
}
