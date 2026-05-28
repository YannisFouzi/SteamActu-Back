import { useMemo, useState } from 'react';
import { type FollowState } from '../useFollow';
import GameRow from './GameRow';

export interface GridItem {
  appId: string;
  name: string;
  image: string;
}

// Reusable filtered grid of games used by Jeux suivis, Mes jeux, Wishlist.
export default function GamesGrid({
  items,
  editable,
  follow,
  emptyLabel,
  filterable = true,
}: {
  items: GridItem[];
  editable: boolean;
  follow: FollowState;
  emptyLabel: string;
  filterable?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const q = filter.trim().toLowerCase();

  const shown = useMemo(
    () => (q === '' ? items : items.filter((i) => i.name.toLowerCase().includes(q))),
    [items, q],
  );

  return (
    <div>
      {filterable && (
        <input
          className="search-input"
          type="text"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <div className="count-line">
        {shown.length}
        {q ? `/${items.length}` : ''} game{shown.length === 1 ? '' : 's'}
      </div>
      {shown.length === 0 ? (
        <div className="state">{q ? 'No match.' : emptyLabel}</div>
      ) : (
        <div className="games-grid">
          {shown.map((item) => (
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
          ))}
        </div>
      )}
    </div>
  );
}
