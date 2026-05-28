import { BellIcon } from './Icons';

// Mirrors the mobile FollowToggle: a round bell button, green/filled when the
// game is followed, blue/outline when not. stopPropagation so taps inside a
// clickable card (news feed) don't also trigger the card's navigation.
export default function FollowBell({
  following,
  busy,
  onToggle,
  size = 24,
}: {
  following: boolean;
  busy: boolean;
  onToggle: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      className={`bell-btn ${following ? 'on' : ''}`}
      disabled={busy}
      aria-pressed={following}
      aria-label={following ? 'Ne plus suivre' : 'Suivre'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <BellIcon size={size} filled={following} />
    </button>
  );
}
