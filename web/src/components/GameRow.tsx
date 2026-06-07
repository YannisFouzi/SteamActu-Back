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
  image: string;
  editable: boolean;
  following: boolean;
  busy: boolean;
  familyShared?: boolean;
  onToggle: () => void;
}

// Mirrors the mobile GameCard: capsule image on the left (Family badge overlaid),
// game name on the right, follow bell at the far end. Image source = the exact
// same chain as the app's getGameImageUrl: the provided header_image (the full,
// working Steam URL) first, then the appId header as a fallback, then the small
// capsule on error, then a placeholder — so the artwork matches the mobile app.
export default function GameRow({
  appId,
  name,
  image,
  editable,
  following,
  busy,
  familyShared = false,
  onToggle,
}: GameRowProps) {
  const { t } = useT();
  const primary = image || gameHeaderUrl(appId);
  const [src, setSrc] = useState(primary);
  const [failed, setFailed] = useState(false);

  // Reset when the row is reused for a different game (list re-render).
  useEffect(() => {
    setSrc(image || gameHeaderUrl(appId));
    setFailed(false);
  }, [appId, image]);

  const handleImgError = () => {
    const capsule = gameCapsuleFallbackUrl(appId);
    if (src !== capsule) {
      setSrc(capsule);
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
