/**
 * Détails des jeux suivis pour l'app (GET /followed-games-details).
 * Résolution nom + images (wishlist Game > Game > subscription).
 *
 * Expose followedAt dans chaque item pour permettre le tri "Récents" côté UI
 * (onglet Jeux suivis). Le tri serveur reste A-Z pour préserver le comportement
 * par défaut — le client re-trie si l'utilisateur sélectionne "Récents".
 */

const User = require('../../models/User');
const Game = require('../../models/Game');
const Wishlist = require('../../models/Wishlist');
const GameSubscription = require('../../models/GameSubscription');

const isUsableHeaderImage = (imageUrl) =>
  Boolean(imageUrl && imageUrl !== 'none');

// Noms placeholder (ex. "Game 3405340", "Jeu 730", "Unknown Game") qu'une source
// — notamment la collection globale Wishlist — peut contenir. Synchronisé avec
// subscriptionManager / userProcessor.
const PLACEHOLDER_NAME_PATTERN = /^((Test Game|Jeu|Game)\s+\d+|Unknown Game)$/i;

const isPlaceholderName = (name) =>
  !name || typeof name !== 'string' || PLACEHOLDER_NAME_PATTERN.test(name.trim());

// Premier nom RÉEL parmi les sources (on saute les placeholders d'où qu'ils
// viennent) → une entrée poubelle de Wishlist n'écrase plus le vrai nom du Game.
const resolveName = (appId, ...candidates) =>
  candidates.find((n) => n && !isPlaceholderName(n)) || `Game ${appId}`;

/**
 * Normalise une entrée followedGames (string legacy ou { appId, followedAt }).
 */
function normalizeEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { appId: entry, followedAt: null, notifications: true };
  }
  if (entry.appId) {
    return {
      appId: String(entry.appId),
      followedAt: entry.followedAt || null,
      // Seul false explicite = suivi silencieux ; legacy sans champ = notifié.
      notifications: entry.notifications !== false,
    };
  }
  return null;
}

/**
 * @param {string} steamId
 * @returns {Promise<
 *   | { type: 'not_found' }
 *   | { type: 'ok'; followedGames: Array<{ appId: string; name: string; header_image: string; imageUrl: string; followedAt: string | null; notifications: boolean }> }
 * >}
 */
async function getFollowedGamesDetailsBySteamId(steamId) {
  const user = await User.findOne({ steamId }).select('followedGames').lean();
  if (!user) {
    return { type: 'not_found' };
  }

  const normalizedEntries = (user.followedGames || [])
    .map(normalizeEntry)
    .filter(Boolean);

  if (normalizedEntries.length === 0) {
    return { type: 'ok', followedGames: [] };
  }

  const followedAtByAppId = new Map(
    normalizedEntries.map((entry) => [entry.appId, entry.followedAt])
  );
  const notificationsByAppId = new Map(
    normalizedEntries.map((entry) => [entry.appId, entry.notifications])
  );
  const followedGameIds = normalizedEntries.map((entry) => entry.appId);

  const [subscriptions, games, wishlistGames] = await Promise.all([
    GameSubscription.find({
      gameId: { $in: followedGameIds },
    })
      .select('gameId name imageUrl')
      .lean(),
    Game.find({
      appId: { $in: followedGameIds },
    })
      .select('appId name header_image')
      .lean(),
    Wishlist.find({
      appId: { $in: followedGameIds },
    })
      .select('appId name header_image')
      .lean(),
  ]);

  const subscriptionsMap = new Map(
    subscriptions.map((sub) => [sub.gameId.toString(), sub])
  );
  const gamesMap = new Map(games.map((game) => [game.appId.toString(), game]));
  const wishlistMap = new Map(
    wishlistGames.map((game) => [game.appId.toString(), game])
  );

  const followedGamesDetails = followedGameIds.map((appId) => {
    const subscription = subscriptionsMap.get(appId);
    const game = gamesMap.get(appId);
    const wishlistGame = wishlistMap.get(appId);
    // Image : le doc Game porte la vraie URL hashée (appdetails) ; la collection
    // Wishlist porte souvent l'URL cloudflare DEVINÉE qui 404 pour les jeux
    // récents → on préfère Game, Wishlist en repli (jeu wishlisté sans doc Game).
    const canonicalHeaderImage =
      (isUsableHeaderImage(game?.header_image) && game.header_image) ||
      (isUsableHeaderImage(wishlistGame?.header_image) &&
        wishlistGame.header_image) ||
      '';
    const followedAtRaw = followedAtByAppId.get(appId);

    return {
      appId,
      name: resolveName(
        appId,
        game?.name,
        subscription?.name,
        wishlistGame?.name,
      ),
      header_image: canonicalHeaderImage,
      imageUrl: subscription?.imageUrl || '',
      followedAt: followedAtRaw ? new Date(followedAtRaw).toISOString() : null,
      // false = suivi silencieux (bouton + sans cloche) — pilote l'état des
      // boutons côté UI (mobile + SPA web via /api/web/profile).
      notifications: notificationsByAppId.get(appId) !== false,
    };
  });

  followedGamesDetails.sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
  );

  return { type: 'ok', followedGames: followedGamesDetails };
}

module.exports = {
  getFollowedGamesDetailsBySteamId,
};
