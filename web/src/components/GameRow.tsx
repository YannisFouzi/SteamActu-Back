import { openExternal } from '../format';

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
  onToggle: () => void;
}

export default function GameRow({
  appId,
  name,
  image,
  editable,
  following,
  busy,
  onToggle,
}: GameRowProps) {
  return (
    <div className="game-row">
      <div
        className="game-row-main"
        role="link"
        tabIndex={0}
        onClick={() => openExternal(storeUrl(appId))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openExternal(storeUrl(appId));
          }
        }}
      >
        <div
          className="game-thumb"
          style={image ? { backgroundImage: `url(${JSON.stringify(image)})` } : undefined}
        />
        <div style={{ minWidth: 0 }}>
          <div className="game-name">{name}</div>
          {!editable && following && <span className="badge">followed</span>}
        </div>
      </div>
      {editable && (
        <button
          className={`follow-btn ${following ? 'on' : ''}`}
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {busy ? '…' : following ? 'Suivi ✓' : '+ Suivre'}
        </button>
      )}
    </div>
  );
}
