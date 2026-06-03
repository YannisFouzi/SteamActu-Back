import { useMemo, useState } from 'react';
import { type WebProfile } from '../api';
import { type FollowState } from '../useFollow';
import { sortFollowed, type FollowedSort } from '../sort';
import { useT } from '../i18n';
import SubTabs, { type SubTab } from '../components/SubTabs';
import SortOptions, { type SortOption } from '../components/SortOptions';
import GamesGrid from '../components/GamesGrid';
import ActuTab from '../tabs/ActuTab';

type Sub = 'fil' | 'jeux-suivis';

export default function ActuSection({
  profile,
  editable,
  follow,
  onNavigateFollow,
}: {
  profile: WebProfile | null;
  editable: boolean;
  follow: FollowState;
  onNavigateFollow: () => void;
}) {
  const { t } = useT();
  const [sub, setSub] = useState<Sub>('fil');
  const [sort, setSort] = useState<FollowedSort>('alphabetical');
  const [query, setQuery] = useState('');

  const TABS: ReadonlyArray<SubTab<Sub>> = [
    { key: 'fil', label: t('nav.feed') },
    { key: 'jeux-suivis', label: t('nav.followedGames') },
  ];

  const SORTS: ReadonlyArray<SortOption<FollowedSort>> = [
    { value: 'alphabetical', label: t('games.sortAZ') },
    { value: 'recent', label: t('games.recents') },
  ];

  const followed = profile?.followedGames ?? [];

  const shown = useMemo(() => {
    const sorted = sortFollowed(followed, sort);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? sorted.filter((g) => (g.name || '').toLowerCase().includes(q))
      : sorted;
    return filtered.map((g) => ({
      appId: g.appId,
      name: g.name,
      image: g.imageUrl || g.header_image,
    }));
  }, [followed, sort, query]);

  return (
    <div>
      <SubTabs tabs={TABS} active={sub} onChange={setSub} />

      {sub === 'fil' && (
        <ActuTab
          editable={editable}
          follow={follow}
          hasFollowedGames={followed.length > 0}
          onNavigateFollow={onNavigateFollow}
        />
      )}

      {sub === 'jeux-suivis' &&
        (profile == null ? (
          <div className="state">{t('common.loading')}</div>
        ) : (
          <>
            <input
              className="search-input"
              type="text"
              placeholder={t('search.placeholderFollowed')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {followed.length > 0 && (
              <SortOptions options={SORTS} selected={sort} onSelect={setSort} />
            )}
            <GamesGrid
              items={shown}
              editable={editable}
              follow={follow}
              emptyLabel={
                query ? t('emptyStates.noResultsTitle') : t('games.followedEmptyText')
              }
            />
          </>
        ))}
    </div>
  );
}
