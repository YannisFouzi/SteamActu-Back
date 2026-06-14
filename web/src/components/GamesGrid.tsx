import { type FollowState } from '../useFollow';
import GameRow from './GameRow';

export interface GridItem {
  appId: string;
  name: string;
  image: string;
  familyShared?: boolean;
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
    <div className="games-list">
      {items.map((item) => {
        const followed = follow.followed.has(item.appId);
        return (
          <GameRow
            key={item.appId}
            appId={item.appId}
            name={item.name}
            image={item.image}
            editable={editable}
            followed={followed}
            notified={follow.notified.has(item.appId)}
            busy={follow.busy.has(item.appId)}
            familyShared={item.familyShared}
            onPlus={() =>
              followed
                ? follow.unfollow(item.appId, item.name, item.image)
                : follow.followSilent(item.appId, item.name, item.image)
            }
            onBell={() =>
              followed
                ? follow.toggleNotify(item.appId)
                : follow.followNotify(item.appId, item.name, item.image)
            }
          />
        );
      })}
    </div>
  );
}
