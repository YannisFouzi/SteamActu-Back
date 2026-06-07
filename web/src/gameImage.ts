// Game artwork URLs — mirrors the mobile getGameImageUrl/getGameImageFallback
// (frontend/src/utils/steamHelpers.js) so the web view shows the EXACT same
// images as the app: the Steam header capsule built from the appId, with the
// small capsule as the on-error fallback. Building from the appId (instead of
// the DB header_image) is what guarantees parity across both surfaces.
const STEAM_CDN =
  'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps';

export function gameHeaderUrl(appId: string): string {
  return `${STEAM_CDN}/${appId}/header.jpg`;
}

export function gameCapsuleFallbackUrl(appId: string): string {
  return `${STEAM_CDN}/${appId}/capsule_sm_120.jpg`;
}
