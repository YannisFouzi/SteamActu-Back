const {
  getFollowedGamesDetailsBySteamId,
} = require('../../../../src/services/users/followedGamesDetailsService');
const {
  createUser,
  createGame,
  createGameSubscription,
  createWishlist,
  nextSteamId,
} = require('../../../helpers/factories');

describe('services/users/followedGamesDetailsService', () => {
  describe('getFollowedGamesDetailsBySteamId()', () => {
    it('renvoie type=not_found si user inexistant', async () => {
      const result = await getFollowedGamesDetailsBySteamId('99999999999999999');
      expect(result).toEqual({ type: 'not_found' });
    });

    it('renvoie une liste vide pour un user sans followed', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const result = await getFollowedGamesDetailsBySteamId(steamId);
      expect(result).toEqual({ type: 'ok', followedGames: [] });
    });

    it('résout name/header/imageUrl en cascade Wishlist > Game > Subscription', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        followedGames: ['730', '570', '440'],
      });
      // 730 : présent dans Wishlist (priorité)
      await createWishlist({
        appId: '730',
        name: 'CSGO (wishlist)',
        header_image: 'https://w/730.jpg',
      });
      await createGame({
        appId: '730',
        name: 'CSGO (game)',
        header_image: 'https://g/730.jpg',
      });
      // 570 : présent seulement dans Game
      await createGame({
        appId: '570',
        name: 'Dota',
        header_image: 'https://g/570.jpg',
      });
      // 440 : seulement dans GameSubscription
      await createGameSubscription({
        gameId: '440',
        name: 'TF2',
        imageUrl: 'https://logo/440.jpg',
      });

      const { type, followedGames } = await getFollowedGamesDetailsBySteamId(
        steamId,
      );
      expect(type).toBe('ok');

      const byId = Object.fromEntries(followedGames.map((g) => [g.appId, g]));
      expect(byId['730']).toMatchObject({
        name: 'CSGO (wishlist)',
        header_image: 'https://w/730.jpg',
        imageUrl: '',
      });
      expect(byId['570']).toMatchObject({
        name: 'Dota',
        header_image: 'https://g/570.jpg',
      });
      expect(byId['440']).toMatchObject({
        name: 'TF2',
        header_image: '',
        imageUrl: 'https://logo/440.jpg',
      });
    });

    it('header_image ignore les valeurs "none"', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'] });
      await createGame({ appId: '730', name: 'CSGO', header_image: 'none' });

      const { followedGames } = await getFollowedGamesDetailsBySteamId(steamId);
      expect(followedGames[0].header_image).toBe('');
    });

    it('expose followedAt (ISO string)', async () => {
      const steamId = nextSteamId();
      const followedAt = new Date('2026-05-01T10:00:00.000Z');
      await createUser({
        steamId,
        followedGames: [{ appId: '730', followedAt }],
      });
      await createGame({ appId: '730', name: 'CSGO' });

      const { followedGames } = await getFollowedGamesDetailsBySteamId(steamId);
      expect(followedGames[0].followedAt).toBe(followedAt.toISOString());
    });

    it('tri alphabétique (case-insensitive, accents)', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        followedGames: ['1', '2', '3'],
      });
      await createGame({ appId: '1', name: 'Zelda' });
      await createGame({ appId: '2', name: 'Élite' });
      await createGame({ appId: '3', name: 'apex' });

      const { followedGames } = await getFollowedGamesDetailsBySteamId(steamId);
      expect(followedGames.map((g) => g.name)).toEqual(['apex', 'Élite', 'Zelda']);
    });

    it('fallback name="Game {appId}" si rien de connu', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['999999'] });

      const { followedGames } = await getFollowedGamesDetailsBySteamId(steamId);
      expect(followedGames[0].name).toBe('Game 999999');
      expect(followedGames[0].header_image).toBe('');
    });
  });
});
