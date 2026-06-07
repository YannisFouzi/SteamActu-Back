import { useEffect, useState } from 'react';
import { openExternal } from '../format';
import { gameCapsuleFallbackUrl, gameHeaderUrl } from '../gameImage';
import { useT } from '../i18n';
import FollowBell from './FollowBell';
import { PeopleIcon } from './Icons';

function storeUrl(appId: string): string {
  return `https://store.steampowered.com/app/${appId}`;
}

export interface GameRowProps {
  appId: string;
  name: string;
  editable: boolean;
  following: boolean;
  busy: boolean;
  familyShared?: boolean;
  onToggle: () => void;
}

// Mirrors the mobile GameCard: capsule image on the left (Family badge overlaid),
// game name on the right, follow bell at the far end. The image uses the exact
// same source chain as the app (header.jpg from the appId → small capsule on
// error → placeholder), so the artwork matches the mobile app.
export default function GameRow({
  appId,
  name,
  editable,
  following,
  busy,
  familyShared = false,
  onToggle,
}: GameRowProps) {
  const { t } = useT();
  const [src, setSrc] = useState(gameHeaderUrl(appId));
  const [failed, setFailed] = useState(false);

  // Reset when the row is reused for a different game (list re-render).
  useEffect(() => {
    setSrc(gameHeaderUrl(appId));
    setFailed(false);
  }, [appId]);

  const handleImgError = () => {
    const fallback = gameCapsuleFallbackUrl(appId);
    if (src !== fallback) {
      setSrc(fallback);
    } else {
      setFailed(true);
    }
  };

  const open = () => openExternal(storeUrl(appId));

  return (
    <div className="game-card">
      <div
        className="game-card-body"
        role="link"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        <div className="game-card-image">
          {failed ? (
            <div className="game-card-image-ph" />
          ) : (
            <img src={src} alt="" loading="lazy" onError={handleImgError} />
          )}
          {familyShared && (
            <span className="game-card-family">
              <PeopleIcon size={10} />
              {t('games.familyBadge')}
            </span>
          )}
        </div>
        <div className="game-card-info">
          <div className="game-card-name">{name}</div>
        </div>
      </div>
      {editable && (
        <FollowBell following={following} busy={busy} onToggle={onToggle} />
      )}
    </div>
  );
}
