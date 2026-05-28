import { type FollowState } from '../useFollow';
import GameRow from './GameRow';

export interface GridItem {
  appId: string;
  name: string;
  image: string;
}

// Pure grid of games. Sorting/filtering is the caller's responsibility.
export default function GamesGrid({
  items,
  editable,
  follow,
  emptyLabel,
}: {
  items: GridItem[];
  editable: boolean;
  follow: FollowState;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <div className="state">{emptyLabel}</div>;
  }
  return (
    <div className="games-grid">
      {items.map((item) => (
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
  );
}
