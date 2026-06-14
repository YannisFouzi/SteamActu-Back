import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { followGame, setFollowNotifications, unfollowGame } from './auth';

export interface FollowState {
  followed: Set<string>;
  notified: Set<string>;
  busy: Set<string>;
  // [+] sur un jeu non suivi → suivi silencieux (fil, sans notifications).
  followSilent: (appId: string, name: string, image: string) => void;
  // cloche sur un jeu non suivi → suit ET notifie d'un coup.
  followNotify: (appId: string, name: string, image: string) => void;
  // cloche sur un jeu déjà suivi → bascule les notifications SANS désabonner.
  toggleNotify: (appId: string) => void;
  // [+] sur un jeu suivi → désabonne (name/image ignorés, pour signature uniforme
  // avec le guard de confirmation qui, lui, en a besoin pour la modale).
  unfollow: (appId: string, name?: string, image?: string) => void;
}

// Two-tier follow state shared across tabs (mirrors the mobile FollowToggle):
//   [+]   = silent follow (in the feed, no notifications)
//   bell  = notifications on/off (a notified game is always followed)
// `followed` = any-level follow; `notified` ⊆ `followed`. Each action is
// optimistic and reverts the touched sets on failure.
export function useFollow(
  seedFollowed: string[],
  seedNotified: string[],
): FollowState {
  const [followed, setFollowed] = useState<Set<string>>(
    () => new Set(seedFollowed),
  );
  const [notified, setNotified] = useState<Set<string>>(
    () => new Set(seedNotified),
  );
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const followedKey = seedFollowed.join(',');
  const notifiedKey = seedNotified.join(',');
  useEffect(() => {
    setFollowed(new Set(seedFollowed));
    setNotified(new Set(seedNotified));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followedKey, notifiedKey]);

  const setFlag = (
    setter: Dispatch<SetStateAction<Set<string>>>,
    appId: string,
    on: boolean,
  ) => {
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(appId);
      else next.delete(appId);
      return next;
    });
  };

  // Apply the optimistic change, fire the request, revert the touched sets on
  // error. busy is per-appId so both controls of a card disable together.
  const run = (
    appId: string,
    optimistic: () => void,
    revert: () => void,
    action: () => Promise<void>,
  ) => {
    setFlag(setBusy, appId, true);
    optimistic();
    action()
      .catch((err: unknown) => {
        console.error('[GameNews] follow mutation failed', err);
        revert();
      })
      .finally(() => setFlag(setBusy, appId, false));
  };

  const followSilent = (appId: string, name: string, image: string) => {
    const wasFollowed = followed.has(appId);
    const wasNotified = notified.has(appId);
    run(
      appId,
      () => {
        setFlag(setFollowed, appId, true);
        setFlag(setNotified, appId, false);
      },
      () => {
        setFlag(setFollowed, appId, wasFollowed);
        setFlag(setNotified, appId, wasNotified);
      },
      () => followGame(appId, name, image, false),
    );
  };

  const followNotify = (appId: string, name: string, image: string) => {
    const wasFollowed = followed.has(appId);
    const wasNotified = notified.has(appId);
    run(
      appId,
      () => {
        setFlag(setFollowed, appId, true);
        setFlag(setNotified, appId, true);
      },
      () => {
        setFlag(setFollowed, appId, wasFollowed);
        setFlag(setNotified, appId, wasNotified);
      },
      () => followGame(appId, name, image, true),
    );
  };

  const toggleNotify = (appId: string) => {
    const wasNotified = notified.has(appId);
    run(
      appId,
      () => setFlag(setNotified, appId, !wasNotified),
      () => setFlag(setNotified, appId, wasNotified),
      () => setFollowNotifications(appId, !wasNotified),
    );
  };

  const unfollow = (appId: string) => {
    const wasFollowed = followed.has(appId);
    const wasNotified = notified.has(appId);
    run(
      appId,
      () => {
        setFlag(setFollowed, appId, false);
        setFlag(setNotified, appId, false);
      },
      () => {
        setFlag(setFollowed, appId, wasFollowed);
        setFlag(setNotified, appId, wasNotified);
      },
      () => unfollowGame(appId),
    );
  };

  return {
    followed,
    notified,
    busy,
    followSilent,
    followNotify,
    toggleNotify,
    unfollow,
  };
}
