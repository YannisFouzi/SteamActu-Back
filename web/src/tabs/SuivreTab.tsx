import { type FollowedGame, type WebProfile, type WishlistGame } from '../api';
import { openExternal } from '../format';

function storeUrl(appId: string): string {
  return `https://store.steampowered.com/app/${appId}`;
}

function GameRow({
  appId,
  name,
  image,
  badge,
}: {
  appId: string;
  name: string;
  image: string;
  badge?: string;
}) {
  return (
    <div
      className="game-row"
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
        {badge && <span className="badge">{badge}</span>}
      </div>
    </div>
  );
}

export default function SuivreTab({ profile }: { profile: WebProfile }) {
  const followed: FollowedGame[] = profile.followedGames ?? [];
  const wishlist: WishlistGame[] = profile.wishlist ?? [];

  return (
    <div>
      <div className="section-title">Followed games ({followed.length})</div>
      {followed.length === 0 ? (
        <div className="state">You don't follow any game yet.</div>
      ) : (
        <div className="games-grid">
          {followed.map((g) => (
            <GameRow
              key={g.appId}
              appId={g.appId}
              name={g.name}
              image={g.imageUrl || g.header_image}
            />
          ))}
        </div>
      )}

      <div className="section-title">Wishlist ({wishlist.length})</div>
      {wishlist.length === 0 ? (
        <div className="state">Your wishlist is empty.</div>
      ) : (
        <div className="games-grid">
          {wishlist.map((g) => (
            <GameRow
              key={g.appId}
              appId={g.appId}
              name={g.name}
              image={g.header_image}
              badge={g.isFollowed ? 'followed' : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
