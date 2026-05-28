import { type FollowedGame, type LibraryGame } from './api';

const byName = (a: string, b: string) =>
  a.localeCompare(b, 'fr', { sensitivity: 'base' });

// ── Jeux suivis (Actu) ─────────────────────────────────────────────────────
export type FollowedSort = 'alphabetical' | 'recent';

export function sortFollowed(
  games: FollowedGame[],
  sort: FollowedSort,
): FollowedGame[] {
  const list = games.slice();
  if (sort === 'recent') {
    return list.sort((a, b) => {
      const at = a.followedAt ? new Date(a.followedAt).getTime() : 0;
      const bt = b.followedAt ? new Date(b.followedAt).getTime() : 0;
      if (bt !== at) return bt - at;
      return byName(a.name || '', b.name || '');
    });
  }
  return list.sort((a, b) => byName(a.name || '', b.name || ''));
}

// ── Mes jeux (Suivre) — mirrors useGamesFiltering.js ───────────────────────
export type LibrarySort = 'lastTwoWeeks' | 'default' | 'mostPlayed';

export function sortLibrary(
  games: LibraryGame[],
  sort: LibrarySort,
): LibraryGame[] {
  let list = games.slice();
  switch (sort) {
    case 'mostPlayed':
      list = list.filter((g) => g.playtimeForever > 0);
      list.sort((a, b) => b.playtimeForever - a.playtimeForever);
      break;
    case 'lastTwoWeeks':
      list = list.filter((g) => g.playtime2weeks > 0);
      list.sort((a, b) => {
        const recentDiff = b.playtime2weeks - a.playtime2weeks;
        if (recentDiff !== 0) return recentDiff;
        const lastDiff = b.lastPlayed - a.lastPlayed;
        if (lastDiff !== 0) return lastDiff;
        return byName(a.name, b.name);
      });
      break;
    case 'default':
    default:
      list.sort((a, b) => byName(a.name, b.name));
      break;
  }
  return list;
}
