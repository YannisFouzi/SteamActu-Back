import { useEffect, useState } from 'react';
import { followGame, unfollowGame } from './auth';

export interface FollowState {
  followed: Set<string>;
  busy: Set<string>;
  toggle: (appId: string, name: string, image: string) => void;
}

// Shared follow state so the Suivre and Rechercher tabs stay in sync. Seeded
// from the loaded profile's followed games; updates optimistically and reverts
// on failure.
export function useFollow(seedIds: string[]): FollowState {
  const [followed, setFollowed] = useState<Set<string>>(() => new Set(seedIds));
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const seedKey = seedIds.join(',');
  useEffect(() => {
    setFollowed(new Set(seedIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const setBusyFor = (appId: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(appId);
      else next.delete(appId);
      return next;
    });
  };

  const flip = (appId: string, follow: boolean) => {
    setFollowed((prev) => {
      const next = new Set(prev);
      if (follow) next.add(appId);
      else next.delete(appId);
      return next;
    });
  };

  const toggle = (appId: string, name: string, image: string) => {
    const isFollowing = followed.has(appId);
    setBusyFor(appId, true);
    flip(appId, !isFollowing); // optimistic
    const action = isFollowing ? unfollowGame(appId) : followGame(appId, name, image);
    action
      .catch((err: unknown) => {
        console.error('[GameNews] toggle follow failed', err);
        flip(appId, isFollowing); // revert
      })
      .finally(() => setBusyFor(appId, false));
  };

  return { followed, busy, toggle };
}
