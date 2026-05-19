jest.doMock('../../../src/services/steamService', () => ({
  getUserGames: jest.fn(),
  getRecentlyPlayedGames: jest.fn(),
  getGameNews: jest.fn(),
  getUserProfile: jest.fn(),
  getUserWishlist: jest.fn(),
  searchGames: jest.fn(),
  SteamApiError: class {},
}));

jest.doMock('../../../src/services/steam/apiClient', () => ({
  fetchGameDetails: jest.fn(),
  fetchUserGames: jest.fn(),
  fetchUserWishlist: jest.fn(),
}));

jest.doMock('../../../src/services/gamesSync/userProcessor', () => ({
  syncUserGames: jest.fn().mockResolvedValue({ updatedGames: [] }),
}));

jest.doMock('../../../src/services/syncWishlistService', () => ({
  syncUserWishlist: jest.fn().mockResolvedValue({ success: true }),
}));

const request = require('supertest');
const { createTestApp } = require('../../helpers/createTestApp');
const steamService = require('../../../src/services/steamService');
const apiClient = require('../../../src/services/steam/apiClient');
const {
  syncUserGames,
} = require('../../../src/services/gamesSync/userProcessor');
const {
  syncUserWishlist,
} = require('../../../src/services/syncWishlistService');
const {
  createUser,
  createGame,
  createWishlist,
  nextSteamId,
} = require('../../helpers/factories');

const app = createTestApp({ mount: ['steam'] });

describe('routes /api/steam', () => {
  beforeEach(() => {
    Object.values(steamService).forEach((fn) => fn?.mockReset?.());
    Object.values(apiClient).forEach((fn) => fn?.mockReset?.());
    syncUserGames.mockReset().mockResolvedValue({ updatedGames: [] });
    syncUserWishlist.mockReset().mockResolvedValue({ success: true });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('GET /api/steam/status/:steamId', () => {
    it('400 si steamId invalide', async () => {
      const r = await request(app).get('/api/steam/status/abc');
      expect(r.status).toBe(400);
    });

    it('404 si user inexistant', async () => {
      const r = await request(app).get('/api/steam/status/76561197960287999');
      expect(r.status).toBe(404);
    });

    it('renvoie gamesVersion + wishlistVersion (ISO ou null)', async () => {
      const steamId = nextSteamId();
      const gv = new Date('2026-05-01T10:00:00.000Z');
      await createUser({ steamId, gamesVersion: gv, wishlistVersion: null });
      const r = await request(app).get(`/api/steam/status/${steamId}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({
        gamesVersion: gv.toISOString(),
        wishlistVersion: null,
      });
    });
  });

  describe('GET /api/steam/games/:steamId', () => {
    it('404 si user inexistant', async () => {
      const r = await request(app).get('/api/steam/games/76561197960287999');
      expect(r.status).toBe(404);
    });

    it('renvoie [] si library vide', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app).get(`/api/steam/games/${steamId}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual([]);
    });

    it('renvoie les jeux enrichis depuis Game + format formatGame', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        gameLibrary: {
          games: [
            {
              gameId: '730',
              playtime_forever: 100,
              playtime_2weeks: 10,
              rtime_last_played: 1_700_000_000,
              hasPlaytimeData: true,
              isFamilyShared: false,
            },
          ],
          lastFullSync: new Date(),
        },
      });
      await createGame({
        appId: '730',
        name: 'CSGO',
        header_image: 'https://img/730.jpg',
        img_icon_url: 'icon',
      });

      const r = await request(app).get(`/api/steam/games/${steamId}`);
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(1);
      expect(r.body[0]).toMatchObject({
        appid: '730',
        name: 'CSGO',
        header_image: 'https://img/730.jpg',
      });
    });

    it('refresh=recent → appelle syncUserGames(force=true)', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });

      await request(app).get(`/api/steam/games/${steamId}?refresh=recent`);
      expect(syncUserGames).toHaveBeenCalledWith(
        expect.objectContaining({ steamId }),
        expect.objectContaining({ force: true }),
      );
    });
  });

  describe('GET /api/steam/profile/:steamId', () => {
    it('404 si profile null', async () => {
      steamService.getUserProfile.mockResolvedValueOnce(null);
      const r = await request(app).get('/api/steam/profile/76561197960287930');
      expect(r.status).toBe(404);
    });

    it('200 + profil renvoyé', async () => {
      const profile = { steamid: '76561197960287930', personaname: 'Alice' };
      steamService.getUserProfile.mockResolvedValueOnce(profile);
      const r = await request(app).get('/api/steam/profile/76561197960287930');
      expect(r.status).toBe(200);
      expect(r.body).toEqual(profile);
    });
  });

  describe('GET /api/steam/wishlist/:steamId', () => {
    it('renvoie [] si user sans wishlist', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app).get(`/api/steam/wishlist/${steamId}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual([]);
    });

    it('joint Wishlist + tri par date_added desc', async () => {
      const steamId = nextSteamId();
      await createWishlist({ appId: '12345', name: 'BF6', header_image: 'h6.jpg' });
      await createWishlist({ appId: '67890', name: 'AAA', header_image: 'h0.jpg' });
      await createUser({
        steamId,
        wishlist: {
          games: [
            { gameId: '12345', date_added: 100 },
            { gameId: '67890', date_added: 200 },
          ],
          lastFullSync: new Date(),
        },
      });

      const r = await request(app).get(`/api/steam/wishlist/${steamId}`);
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(2);
      expect(r.body[0].name).toBe('AAA'); // date_added 200 → premier
      expect(r.body[1].name).toBe('BF6');
    });
  });

  describe('GET /api/steam/search', () => {
    it('400 si query trop courte', async () => {
      const r = await request(app).get('/api/steam/search?q=a');
      expect(r.status).toBe(400);
    });

    it('400 si query absente', async () => {
      const r = await request(app).get('/api/steam/search');
      expect(r.status).toBe(400);
    });

    it('400 si query > 100 chars', async () => {
      const r = await request(app).get(`/api/steam/search?q=${'a'.repeat(120)}`);
      expect(r.status).toBe(400);
    });

    it('200 + délègue à searchGames (limit clampé)', async () => {
      steamService.searchGames.mockResolvedValueOnce([
        { appid: 730, name: 'CSGO' },
      ]);
      const r = await request(app).get('/api/steam/search?q=csgo&limit=99');
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(1);
      expect(steamService.searchGames).toHaveBeenCalledWith('csgo', 20);
    });
  });

  describe('POST /api/steam/check-visibility/:steamId', () => {
    it('renvoie visible=false si fetchUserGames vide ET wishlist vide', async () => {
      apiClient.fetchUserGames.mockResolvedValueOnce([]);
      apiClient.fetchUserWishlist.mockResolvedValueOnce([]);
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app).post(`/api/steam/check-visibility/${steamId}`);
      expect(r.status).toBe(200);
      expect(r.body.visible).toBe(false);
      expect(r.body.wishlistVisible).toBe(false);
    });

    it('renvoie visible=true et lance syncUserGames + syncUserWishlist si games présents', async () => {
      apiClient.fetchUserGames.mockResolvedValueOnce([
        { appid: 730, name: 'CSGO', playtime_forever: 100 },
      ]);
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app).post(`/api/steam/check-visibility/${steamId}`);
      expect(r.status).toBe(200);
      expect(r.body.visible).toBe(true);
      expect(r.body.gamesCount).toBe(1);
      expect(syncUserGames).toHaveBeenCalled();
      expect(syncUserWishlist).toHaveBeenCalledWith(steamId);
    });
  });
});
