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

// Wraps a FollowState so that UNFOLLOWING (the [+] tapped on an already-followed
// game) pops a confirmation when confirmEnabled is on, mirroring the mobile
// FollowToggle. Silent-follow, notify-follow and the bell's notification toggle
// stay immediate — only the destructive unfollow is gated. onDisableConfirm is
// called when the user ticks "don't ask again".
export function useUnfollowGuard(
  base: FollowState,
  confirmEnabled: boolean,
  onDisableConfirm: () => void,
): UnfollowGuard {
  const [pending, setPending] = useState<Pending | null>(null);

  const unfollow = (appId: string, name = '', image = '') => {
    if (confirmEnabled) {
      setPending({ appId, name, image });
      return;
    }
    base.unfollow(appId);
  };

  const confirm = (dontAskAgain: boolean) => {
    if (!pending) return;
    if (dontAskAgain) onDisableConfirm();
    base.unfollow(pending.appId);
    setPending(null);
  };

  const cancel = () => setPending(null);

  return {
    follow: { ...base, unfollow },
    pending,
    confirm,
    cancel,
  };
}
