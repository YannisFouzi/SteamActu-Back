import { useState } from 'react';
import { type WebProfile } from '../api';
import { type FollowState } from '../useFollow';
import SubTabs, { type SubTab } from '../components/SubTabs';
import GamesGrid from '../components/GamesGrid';
import ActuTab from '../tabs/ActuTab';

type Sub = 'fil' | 'jeux-suivis';
const TABS: ReadonlyArray<SubTab<Sub>> = [
  { key: 'fil', label: "Fil d'actu" },
  { key: 'jeux-suivis', label: 'Jeux suivis' },
];

export default function ActuSection({
  profile,
  editable,
  follow,
}: {
  profile: WebProfile | null;
  editable: boolean;
  follow: FollowState;
}) {
  const [sub, setSub] = useState<Sub>('fil');

  const followedItems = (profile?.followedGames ?? []).map((g) => ({
    appId: g.appId,
    name: g.name,
    image: g.imageUrl || g.header_image,
  }));

  return (
    <div>
      <SubTabs tabs={TABS} active={sub} onChange={setSub} />
      {sub === 'fil' && <ActuTab />}
      {sub === 'jeux-suivis' &&
        (profile == null ? (
          <div className="state">Loading…</div>
        ) : (
          <GamesGrid
            items={followedItems}
            editable={editable}
            follow={follow}
            emptyLabel="You don't follow any game yet."
          />
        ))}
    </div>
  );
}
