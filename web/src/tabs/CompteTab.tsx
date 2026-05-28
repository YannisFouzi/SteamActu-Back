import { type WebProfile } from '../api';
import { maskSteamId } from '../format';

export default function CompteTab({ profile }: { profile: WebProfile }) {
  const a = profile.account;
  const rows: Array<[string, string]> = [
    ['SteamID', maskSteamId(profile.steamId)],
    ['Language', profile.language],
    ['Followed games', String(a.followedCount)],
    ['Wishlist games', String(a.wishlistCount)],
    ['News notifications', a.newsNotifications ? 'on' : 'off'],
    ['Library auto-follow', a.libraryFollowMode],
    ['Wishlist auto-follow', a.wishlistFollowMode],
  ];

  return (
    <div className="account-card">
      {rows.map(([label, value]) => (
        <div className="account-row" key={label}>
          <span>{label}</span>
          <span className="val">{value}</span>
        </div>
      ))}
    </div>
  );
}
