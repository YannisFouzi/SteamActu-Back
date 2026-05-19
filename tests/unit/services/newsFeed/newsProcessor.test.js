const steamServiceMock = {
  getGameNews: jest.fn(),
};

jest.doMock('../../../../src/services/steamService', () => steamServiceMock);

const {
  processNewsForGames,
  filterAndSortNews,
} = require('../../../../src/services/newsFeed/newsProcessor');

describe('services/newsFeed/newsProcessor', () => {
  beforeEach(() => {
    steamServiceMock.getGameNews.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('processNewsForGames()', () => {
    it('agrège les news de plusieurs jeux et retourne feedItems + latestNewsByGame', async () => {
      steamServiceMock.getGameNews
        .mockResolvedValueOnce([
          {
            gid: 'n1',
            title: 'Patch A',
            url: 'https://x/1',
            author: 'devA',
            date: 1700000010,
            contents: '<img src="https://img/1.jpg">',
            feedlabel: 'Steam',
          },
        ])
        .mockResolvedValueOnce([
          {
            gid: 'n2',
            title: 'Patch B',
            url: 'https://x/2',
            author: 'devB',
            date: 1700000020,
            contents: 'plain',
            feedlabel: 'Steam',
          },
        ]);

      const games = [
        { appId: '730', name: 'CSGO', imageUrl: 'logo730' },
        { appId: '570', name: 'Dota', imageUrl: null },
      ];
      const followedSet = new Set(['730']);

      const { feedItems, latestNewsByGame } = await processNewsForGames(
        games,
        followedSet,
        { perGameLimit: 3, language: 'fr' },
      );

      expect(feedItems).toHaveLength(2);
      const byAppId = Object.fromEntries(feedItems.map((it) => [it.appId, it]));
      expect(byAppId['730'].isFollowed).toBe(true);
      expect(byAppId['730'].gameName).toBe('CSGO');
      expect(byAppId['730'].gameLogoUrl).toBe('logo730');
      expect(byAppId['730'].news).toMatchObject({
        id: 'n1',
        title: 'Patch A',
        firstImageUrl: 'https://img/1.jpg',
      });
      expect(byAppId['730'].news.date).toBe(1700000010 * 1000);
      expect(byAppId['570'].isFollowed).toBe(false);
      expect(latestNewsByGame.get('730')).toBe(1700000010 * 1000);
      expect(latestNewsByGame.get('570')).toBe(1700000020 * 1000);
    });

    it('appelle steamService avec (appId, perGameLimit, undefined, language)', async () => {
      steamServiceMock.getGameNews.mockResolvedValue([]);
      await processNewsForGames(
        [{ appId: '730', name: 'CSGO' }],
        new Set(),
        { perGameLimit: 7, language: 'en' },
      );
      expect(steamServiceMock.getGameNews).toHaveBeenCalledWith(
        '730',
        7,
        undefined,
        'en',
      );
    });

    it('défaut perGameLimit=3 et language=fr', async () => {
      steamServiceMock.getGameNews.mockResolvedValue([]);
      await processNewsForGames([{ appId: '730', name: 'CSGO' }], new Set());
      expect(steamServiceMock.getGameNews).toHaveBeenCalledWith('730', 3, undefined, 'fr');
    });

    it('ignore les jeux dont steamService throw (skip ce jeu)', async () => {
      steamServiceMock.getGameNews
        .mockRejectedValueOnce(new Error('429'))
        .mockResolvedValueOnce([
          { gid: 'n2', title: 'B', url: 'u', author: 'a', date: 100, contents: '' },
        ]);

      const { feedItems } = await processNewsForGames(
        [
          { appId: '730', name: 'CSGO' },
          { appId: '570', name: 'Dota' },
        ],
        new Set(),
      );

      expect(feedItems).toHaveLength(1);
      expect(feedItems[0].appId).toBe('570');
    });

    it('retourne feedItems vide si tous les jeux renvoient []', async () => {
      steamServiceMock.getGameNews.mockResolvedValue([]);
      const { feedItems, latestNewsByGame } = await processNewsForGames(
        [{ appId: '730', name: 'CSGO' }],
        new Set(),
      );
      expect(feedItems).toEqual([]);
      expect(latestNewsByGame.size).toBe(0);
    });

    it('latestDate = date max des news du jeu', async () => {
      steamServiceMock.getGameNews.mockResolvedValueOnce([
        { gid: 'a', title: 'A', url: 'u', author: 'x', date: 1000, contents: '' },
        { gid: 'b', title: 'B', url: 'u', author: 'x', date: 3000, contents: '' },
        { gid: 'c', title: 'C', url: 'u', author: 'x', date: 2000, contents: '' },
      ]);

      const { latestNewsByGame } = await processNewsForGames(
        [{ appId: '730', name: 'CSGO' }],
        new Set(),
      );
      expect(latestNewsByGame.get('730')).toBe(3000 * 1000);
    });

    it('parallélise avec concurrency cap (10)', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      steamServiceMock.getGameNews.mockImplementation(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return [];
      });

      const games = Array.from({ length: 25 }, (_, i) => ({
        appId: String(i),
        name: `G${i}`,
      }));
      await processNewsForGames(games, new Set());

      expect(maxInFlight).toBeLessThanOrEqual(10);
      expect(steamServiceMock.getGameNews).toHaveBeenCalledTimes(25);
    });
  });

  describe('filterAndSortNews()', () => {
    it('trie par date desc', () => {
      const items = [
        { news: { date: 100 } },
        { news: { date: 300 } },
        { news: { date: 200 } },
      ];
      const { timeline, recentItems } = filterAndSortNews(items);
      expect(timeline.map((i) => i.news.date)).toEqual([300, 200, 100]);
      expect(recentItems).toBe(timeline);
    });

    it('défaut [] si input absent', () => {
      const { timeline } = filterAndSortNews();
      expect(timeline).toEqual([]);
    });

    it('gère news ou date manquante (0 par défaut)', () => {
      const items = [
        { news: { date: 100 } },
        {}, // pas de news
        { news: {} },
      ];
      const { timeline } = filterAndSortNews(items);
      expect(timeline).toHaveLength(3);
      expect(timeline[0].news.date).toBe(100);
    });
  });
});
