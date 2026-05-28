import { useState } from 'react';
import { type WebProfile } from '../api';
import { followGame, unfollowGame } from '../auth';
import { openExternal } from '../format';

function storeUrl(appId: string): string {
  return `https://store.steampowered.com/app/${appId}`;
}

interface RowItem {
  appId: string;
  name: string;
  image: string;
}

function GameRow({
  item,
  editable,
  following,
  busy,
  onToggle,
}: {
  item: RowItem;
  editable: boolean;
  following: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="game-row">
      <div
        className="game-row-main"
        role="link"
        tabIndex={0}
        onClick={() => openExternal(storeUrl(item.appId))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openExternal(storeUrl(item.appId));
          }
        }}
      >
        <div
          className="game-thumb"
          style={item.image ? { backgroundImage: `url(${JSON.stringify(item.image)})` } : undefined}
        />
        <div style={{ minWidth: 0 }}>
          <div className="game-name">{item.name}</div>
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

export default function SuivreTab({
  profile,
  editable,
}: {
  profile: WebProfile;
  editable: boolean;
}) {
  // Local optimistic follow-state, seeded from the loaded profile.
  const [followed, setFollowed] = useState<Set<string>>(
    () => new Set(profile.followedGames.map((g) => g.appId)),
  );
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const setBusyFor = (appId: string, on: boolean) => {
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(appId);
      else next.delete(appId);
      return next;
    });
  };

  const toggle = async (appId: string, name: string, image: string) => {
    const isFollowing = followed.has(appId);
    setBusyFor(appId, true);
    // Optimistic flip.
    setFollowed((prev) => {
      const next = new Set(prev);
      if (isFollowing) next.delete(appId);
      else next.add(appId);
      return next;
    });
    try {
      if (isFollowing) {
        await unfollowGame(appId);
      } else {
        await followGame(appId, name, image);
      }
    } catch (err) {
      console.error('[GameNews] toggle follow failed', err);
      // Revert on failure.
      setFollowed((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.add(appId);
        else next.delete(appId);
        return next;
      });
    } finally {
      setBusyFor(appId, false);
    }
  };

  const followedList = profile.followedGames.map((g) => ({
    appId: g.appId,
    name: g.name,
    image: g.imageUrl || g.header_image,
  }));
  const wishlistList = profile.wishlist.map((g) => ({
    appId: g.appId,
    name: g.name,
    image: g.header_image,
  }));

  return (
    <div>
      {!editable && (
        <div className="hint">Connecting your Steam account…</div>
      )}

      <div className="section-title">
        Followed games ({profile.followedGames.length})
      </div>
      {followedList.length === 0 ? (
        <div className="state">You don't follow any game yet.</div>
      ) : (
        <div className="games-grid">
          {followedList.map((item) => (
            <GameRow
              key={item.appId}
              item={item}
              editable={editable}
              following={followed.has(item.appId)}
              busy={busy.has(item.appId)}
              onToggle={() => toggle(item.appId, item.name, item.image)}
            />
          ))}
        </div>
      )}

      <div className="section-title">Wishlist ({profile.wishlist.length})</div>
      {wishlistList.length === 0 ? (
        <div className="state">Your wishlist is empty.</div>
      ) : (
        <div className="games-grid">
          {wishlistList.map((item) => (
            <GameRow
              key={item.appId}
              item={item}
              editable={editable}
              following={followed.has(item.appId)}
              busy={busy.has(item.appId)}
              onToggle={() => toggle(item.appId, item.name, item.image)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
