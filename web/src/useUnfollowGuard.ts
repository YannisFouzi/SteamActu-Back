import { useState } from 'react';
import { type FollowState } from './useFollow';

interface Pending {
  appId: string;
  name: string;
  image: string;
}

export interface UnfollowGuard {
  follow: FollowState;
  pending: Pending | null;
  confirm: (dontAskAgain: boolean) => void;
  cancel: () => void;
}

// Wraps a FollowState so that unfollowing (bell tap on an already-followed game)
// pops a confirmation when confirmEnabled is on, mirroring the mobile
// FollowToggle. Following stays immediate. onDisableConfirm is called when the
// user ticks "don't ask again".
export function useUnfollowGuard(
  base: FollowState,
  confirmEnabled: boolean,
  onDisableConfirm: () => void,
): UnfollowGuard {
  const [pending, setPending] = useState<Pending | null>(null);

  const toggle = (appId: string, name: string, image: string) => {
    const isFollowing = base.followed.has(appId);
    if (isFollowing && confirmEnabled) {
      setPending({ appId, name, image });
      return;
    }
    base.toggle(appId, name, image);
  };

  const confirm = (dontAskAgain: boolean) => {
    if (!pending) return;
    if (dontAskAgain) onDisableConfirm();
    base.toggle(pending.appId, pending.name, pending.image);
    setPending(null);
  };

  const cancel = () => setPending(null);

  return {
    follow: { followed: base.followed, busy: base.busy, toggle },
    pending,
    confirm,
    cancel,
  };
}
