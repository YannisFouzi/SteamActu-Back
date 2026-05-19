jest.mock('axios');

const axios = require('axios');

const {
  fetchUserGames,
  fetchRecentlyPlayedGames,
  fetchGameNews,
  fetchUserProfile,
  fetchUserWishlist,
  fetchGameDetails,
  searchGames,
  SteamApiError,
} = require('../../../../src/services/steam/apiClient');

describe('services/steam/apiClient', () => {
  beforeEach(() => {
    axios.get.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('SteamApiError', () => {
    it('est une Error avec name="SteamApiError"', () => {
      const err = new SteamApiError('boom', { status: 500 });
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('SteamApiError');
      expect(err.status).toBe(500);
    });

    it('isExpected : true pour 403/404, false sinon', () => {
      expect(new SteamApiError('x', { status: 403 }).isExpected).toBe(true);
      expect(new SteamApiError('x', { status: 404 }).isExpected).toBe(true);
      expect(new SteamApiError('x', { status: 500 }).isExpected).toBe(false);
      expect(new SteamApiError('x', { status: 429 }).isExpected).toBe(false);
    });

    it('isRateLimited : true uniquement pour 429', () => {
      expect(new SteamApiError('x', { status: 429 }).isRateLimited).toBe(true);
      expect(new SteamApiError('x', { status: 503 }).isRateLimited).toBe(false);
    });

    it('isServerError : true pour 5xx, false sinon', () => {
      expect(new SteamApiError('x', { status: 500 }).isServerError).toBe(true);
      expect(new SteamApiError('x', { status: 503 }).isServerError).toBe(true);
      expect(new SteamApiError('x', { status: 404 }).isServerError).toBe(false);
      expect(new SteamApiError('x', { status: null }).isServerError).toBe(false);
    });
  });

  describe('fetchUserGames()', () => {
    it('appelle GetOwnedGames avec les bons params + timeout 10s', async () => {
      axios.get.mockResolvedValue({
        data: { response: { games: [{ appid: 730, name: 'CSGO' }] } },
      });

      const games = await fetchUserGames('76561197960287930');

      expect(games).toEqual([{ appid: 730, name: 'CSGO' }]);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/IPlayerService/GetOwnedGames/'),
        expect.objectContaining({
          params: expect.objectContaining({
            steamid: '76561197960287930',
            include_appinfo: true,
            include_played_free_games: true,
          }),
          timeout: 10000,
        }),
      );
    });

    it('retourne [] si response.games absent', async () => {
      axios.get.mockResolvedValue({ data: { response: {} } });
      expect(await fetchUserGames('x')).toEqual([]);
    });

    it('lève SteamApiError avec status sur erreur HTTP', async () => {
      axios.get.mockRejectedValue({
        message: 'Request failed',
        response: { status: 403 },
        code: null,
      });

      await expect(fetchUserGames('x')).rejects.toMatchObject({
        name: 'SteamApiError',
        status: 403,
      });
    });

    it('lève SteamApiError avec code sur erreur réseau', async () => {
      axios.get.mockRejectedValue({
        message: 'timeout',
        code: 'ECONNABORTED',
      });

      const err = await fetchUserGames('x').catch((e) => e);
      expect(err).toBeInstanceOf(SteamApiError);
      expect(err.code).toBe('ECONNABORTED');
      expect(err.status).toBeNull();
    });
  });

  describe('fetchRecentlyPlayedGames()', () => {
    it('appelle GetRecentlyPlayedGames avec count=0 (defaut Steam)', async () => {
      axios.get.mockResolvedValue({
        data: { response: { games: [{ appid: 570 }] } },
      });

      const games = await fetchRecentlyPlayedGames('76561197960287930');
      expect(games).toEqual([{ appid: 570 }]);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/IPlayerService/GetRecentlyPlayedGames/'),
        expect.objectContaining({
          params: expect.objectContaining({ count: 0 }),
        }),
      );
    });

    it('retourne [] si response.games absent', async () => {
      axios.get.mockResolvedValue({ data: { response: {} } });
      expect(await fetchRecentlyPlayedGames('x')).toEqual([]);
    });
  });

  describe('fetchGameNews()', () => {
    it('utilise timeout 5s et langue Steam mappée', async () => {
      axios.get.mockResolvedValue({
        data: { appnews: { newsitems: [{ gid: '1', title: 'a' }] } },
      });

      const news = await fetchGameNews('730', { count: 3, language: 'fr' });
      expect(news).toEqual([{ gid: '1', title: 'a' }]);
      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('/ISteamNews/GetNewsForApp/'),
        expect.objectContaining({
          params: expect.objectContaining({
            appid: '730',
            count: 3,
            language: 'french',
            feeds: 'steam_community_announcements,steam_updates',
          }),
          timeout: 5000,
        }),
      );
    });

    it('clamp safeCount dans [1, 100]', async () => {
      axios.get.mockResolvedValue({ data: { appnews: { newsitems: [] } } });
      await fetchGameNews('730', { count: 0 });
      expect(axios.get.mock.calls[0][1].params.count).toBe(5);

      axios.get.mockClear();
      await fetchGameNews('730', { count: 999 });
      expect(axios.get.mock.calls[0][1].params.count).toBe(100);

      axios.get.mockClear();
      await fetchGameNews('730', { count: -5 });
      expect(axios.get.mock.calls[0][1].params.count).toBe(1);
    });

    it('omet feeds si steamOnly=false', async () => {
      axios.get.mockResolvedValue({ data: { appnews: { newsitems: [] } } });
      await fetchGameNews('730', { steamOnly: false });
      expect(axios.get.mock.calls[0][1].params.feeds).toBeUndefined();
    });

    it('slice à safeCount items max', async () => {
      const newsitems = Array.from({ length: 20 }, (_, i) => ({ gid: String(i) }));
      axios.get.mockResolvedValue({ data: { appnews: { newsitems } } });
      const news = await fetchGameNews('730', { count: 5 });
      expect(news).toHaveLength(5);
    });
  });

  describe('fetchUserProfile()', () => {
    it('retourne le premier joueur', async () => {
      axios.get.mockResolvedValue({
        data: {
          response: {
            players: [{ steamid: '76561197960287930', personaname: 'Alice' }],
          },
        },
      });

      const profile = await fetchUserProfile('76561197960287930');
      expect(profile).toEqual({
        steamid: '76561197960287930',
        personaname: 'Alice',
      });
    });

    it('retourne null si aucun joueur', async () => {
      axios.get.mockResolvedValue({ data: { response: { players: [] } } });
      expect(await fetchUserProfile('x')).toBeNull();
    });
  });

  describe('fetchUserWishlist()', () => {
    it('map les items en { appid, date_added, priority }', async () => {
      axios.get.mockResolvedValue({
        data: {
          response: {
            items: [
              { appid: 123, date_added: 1700000000, priority: 1 },
              { appid: 456, date_added: 1700000100, priority: 2 },
            ],
          },
        },
      });

      const wl = await fetchUserWishlist('76561197960287930');
      expect(wl).toEqual([
        { appid: 123, date_added: 1700000000, priority: 1 },
        { appid: 456, date_added: 1700000100, priority: 2 },
      ]);
    });

    it('retourne [] si response.items absent', async () => {
      axios.get.mockResolvedValue({ data: { response: {} } });
      expect(await fetchUserWishlist('x')).toEqual([]);
    });

    it('propage l\'erreur en cas de panne', async () => {
      axios.get.mockRejectedValue({
        message: 'down',
        response: { status: 500 },
      });
      await expect(fetchUserWishlist('x')).rejects.toThrow();
    });
  });

  describe('fetchGameDetails()', () => {
    it('parse les détails du store (success=true)', async () => {
      axios.get.mockResolvedValue({
        data: {
          730: {
            success: true,
            data: {
              name: 'CSGO',
              header_image: 'header.jpg',
              capsule_image: 'capsule.jpg',
              short_description: 'desc',
            },
          },
        },
      });

      const details = await fetchGameDetails(730, 'fr');
      expect(details).toEqual({
        name: 'CSGO',
        header_image: 'header.jpg',
        capsule_image: 'capsule.jpg',
        short_description: 'desc',
      });
      expect(axios.get).toHaveBeenCalledWith(
        'https://store.steampowered.com/api/appdetails',
        expect.objectContaining({
          params: expect.objectContaining({ appids: 730, l: 'french' }),
          timeout: 8000,
        }),
      );
    });

    it('retourne null si success=false', async () => {
      axios.get.mockResolvedValue({ data: { 730: { success: false } } });
      expect(await fetchGameDetails(730)).toBeNull();
    });

    it('retourne null en cas d\'erreur (silent)', async () => {
      axios.get.mockRejectedValue(new Error('down'));
      expect(await fetchGameDetails(730)).toBeNull();
    });
  });

  describe('searchGames()', () => {
    it('map et limite les résultats', async () => {
      axios.get.mockResolvedValue({
        data: [
          { appid: '730', name: 'CSGO', logo: 'logo.jpg', icon: 'icon.jpg' },
          { appid: '570', name: 'Dota', logo: '', icon: '' },
          { appid: '440', name: 'TF2' },
        ],
      });

      const results = await searchGames('csgo', 2);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({
        appid: 730,
        name: 'CSGO',
        header_image: 'logo.jpg',
      });
      expect(results[1].header_image).toContain('/steam/apps/570/header.jpg');
    });

    it('retourne [] si la réponse n\'est pas un array', async () => {
      axios.get.mockResolvedValue({ data: null });
      expect(await searchGames('x')).toEqual([]);
    });

    it('retourne [] en cas d\'erreur (silent)', async () => {
      axios.get.mockRejectedValue(new Error('down'));
      expect(await searchGames('x')).toEqual([]);
    });

    it('URL-encode la query', async () => {
      axios.get.mockResolvedValue({ data: [] });
      await searchGames('jeu avec espaces');
      expect(axios.get.mock.calls[0][0]).toContain('jeu%20avec%20espaces');
    });
  });
});
