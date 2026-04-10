/**
 * Détails des jeux suivis pour l'app (GET /followed-games-details).
 * Résolution nom + images (wishlist Game > Game > subscription).
 */

const User = require('../../models/User');
const Game = require('../../models/Game');
const Wishlist = require('../../models/Wishlist');
const GameSubscription = require('../../models/GameSubscription');

const isUsableHeaderImage = (imageUrl) =>
  Boolean(imageUrl && imageUrl !== 'none');

/**
 * @param {string} steamId
 * @returns {Promise<
 *   | { type: 'not_found' }
 *   | { type: 'ok'; followedGames: Array<{ appId: string; name: string; header_image: string; imageUrl: string }> }
 * >}
 */
async function getFollowedGamesDetailsBySteamId(steamId) {
  const user = await User.findOne({ steamId }).select('followedGames').lean();
  if (!user) {
    return { type: 'not_found' };
  }

  if (!user.followedGames || user.followedGames.length === 0) {
    return { type: 'ok', followedGames: [] };
  }

  const followedGameIds = user.followedGames.map((gameId) => gameId.toString());

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
    const canonicalHeaderImage =
      (isUsableHeaderImage(wishlistGame?.header_image) &&
        wishlistGame.header_image) ||
      (isUsableHeaderImage(game?.header_image) && game.header_image) ||
      '';

    return {
      appId,
      name:
        wishlistGame?.name ||
        game?.name ||
        subscription?.name ||
        `Game ${appId}`,
      header_image: canonicalHeaderImage,
      imageUrl: subscription?.imageUrl || '',
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
