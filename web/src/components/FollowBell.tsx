import { useT } from '../i18n';
import { AddIcon, BellIcon, CheckmarkIcon } from './Icons';

// Two-tier follow controls, mirroring the mobile FollowToggle: [+] on the left
// (silent follow / unfollow), bell on the right (notifications). [+] is green
// once followed (any level); the bell is green once notified. A notified game is
// always followed. stopPropagation so taps inside a clickable card (news feed)
// don't also trigger the card's navigation.
export default function FollowBell({
  followed,
  notified,
  busy,
  onPlus,
  onBell,
  size = 24,
}: {
  followed: boolean;
  notified: boolean;
  busy: boolean;
  onPlus: () => void;
  onBell: () => void;
  size?: number;
}) {
  const { t } = useT();
  return (
    <div className="follow-controls">
      <button
        type="button"
        className={`plus-btn ${followed ? 'on' : ''}`}
        disabled={busy}
        aria-pressed={followed}
        aria-label={followed ? t('web.unfollow') : t('web.followSilent')}
        onClick={(e) => {
          e.stopPropagation();
          onPlus();
        }}
      >
        {followed ? <CheckmarkIcon size={size} /> : <AddIcon size={size} />}
      </button>
      <button
        type="button"
        className={`bell-btn ${notified ? 'on' : ''}`}
        disabled={busy}
        aria-pressed={notified}
        aria-label={notified ? t('web.notificationsOff') : t('web.notificationsOn')}
        onClick={(e) => {
          e.stopPropagation();
          onBell();
        }}
      >
        <BellIcon size={size} filled={notified} />
      </button>
    </div>
  );
}
