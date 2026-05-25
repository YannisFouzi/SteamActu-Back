jest.doMock('../../../src/services/steamService', () => ({
  getGameNews: jest.fn(),
  getUserGames: jest.fn(),
  getRecentlyPlayedGames: jest.fn(),
  getUserProfile: jest.fn(),
  getUserWishlist: jest.fn(),
  searchGames: jest.fn(),
  SteamApiError: class {},
}));

const request = require('supertest');
const { createTestApp } = require('../../helpers/createTestApp');
const steamService = require('../../../src/services/steamService');
const UserNewsState = require('../../../src/models/UserNewsState');
const {
  createUser,
  createGameSubscription,
  nextSteamId,
} = require('../../helpers/factories');
const { authHeader } = require('../../helpers/authHeaders');

const app = createTestApp({ mount: ['news'] });

function makeNewsItem(overrides = {}) {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    gid: 'n1',
    title: 'Patch',
    url: 'https://steamcommunity.com/news/1',
    author: 'dev',
    date: nowSec,
    contents: '<img src="https://img/1.jpg" />',
    feedlabel: 'Steam',
    ...overrides,
  };
}

describe('routes /api/news', () => {
  beforeEach(() => {
    steamService.getGameNews.mockReset();
  });

  describe('GET /api/news/game/:appId', () => {
    // Route PUBLIQUE: pas de steamId implique, donnees agnostiques

    it('400 si appId invalide', async () => {
      const r = await request(app).get('/api/news/game/abc');
      expect(r.status).toBe(400);
    });

    it('200 + délègue à steamService avec params clampés', async () => {
      steamService.getGameNews.mockResolvedValueOnce([makeNewsItem()]);
      const r = await request(app).get(
        '/api/news/game/730?count=999&maxLength=99999&language=en-US&steamOnly=false',
      );
      expect(r.status).toBe(200);
      expect(r.body).toHaveLength(1);
      expect(steamService.getGameNews).toHaveBeenCalledWith(
        '730',
        100,
        5000,
        'en',
        false,
      );
    });

    it('default count=5 si non fourni', async () => {
      steamService.getGameNews.mockResolvedValueOnce([]);
      await request(app).get('/api/news/game/730');
      expect(steamService.getGameNews).toHaveBeenCalledWith('730', 5, 300, 'fr', true);
    });

    it('500 si service throw', async () => {
      steamService.getGameNews.mockRejectedValueOnce(new Error('boom'));
      const r = await request(app).get('/api/news/game/730');
      expect(r.status).toBe(500);
    });
  });

  describe('GET /api/news/feed', () => {
    it('401 si pas de header Authorization', async () => {
      const r = await request(app).get(
        '/api/news/feed?steamId=76561197960287930',
      );
      expect(r.status).toBe(401);
    });

    it('403 si query.steamId != session.steamId', async () => {
      const attackerId = '76561197960287777';
      const victimId = '76561197960287930';
      const r = await request(app)
        .get(`/api/news/feed?steamId=${victimId}`)
        .set(authHeader(attackerId));
      expect(r.status).toBe(403);
    });

    it('400 si steamId invalide', async () => {
      // sessionId valide + query.steamId 'abc' -> requireSelf 403 (mismatch)
      // (validateSteamId est cote route GET /feed apres requireSelf)
      const steamId = '76561197960287930';
      const r = await request(app)
        .get('/api/news/feed?steamId=abc')
        .set(authHeader(steamId));
      expect(r.status).toBe(403);
    });

    it('200 + items vides si user sans followed', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .get(`/api/news/feed?steamId=${steamId}`)
        .set(authHeader(steamId));
      expect(r.status).toBe(200);
      expect(r.body.items).toEqual([]);
      expect(r.body.metadata.source).toBe('followed');
    });

    it('agrège les news pour les jeux suivis et trie par date desc', async () => {
      const steamId = nextSteamId();
      const nowSec = Math.floor(Date.now() / 1000);
      await createUser({ steamId, followedGames: ['730', '570'] });
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        subscribers: [steamId],
      });
      await createGameSubscription({
        gameId: '570',
        name: 'Dota',
        subscribers: [steamId],
      });

      steamService.getGameNews
        .mockResolvedValueOnce([makeNewsItem({ gid: 'a', date: nowSec - 100 })])
        .mockResolvedValueOnce([makeNewsItem({ gid: 'b', date: nowSec - 50 })]);

      const r = await request(app)
        .get(`/api/news/feed?steamId=${steamId}`)
        .set(authHeader(steamId));
      expect(r.status).toBe(200);
      expect(r.body.items).toHaveLength(2);
      expect(r.body.items[0].news.id).toBe('b'); // plus récent en premier
    });

    it('écrit inFeedAt dans UserNewsState pour les items servis', async () => {
      const steamId = nextSteamId();
      const nowSec = Math.floor(Date.now() / 1000);
      await createUser({ steamId, followedGames: ['730'] });
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        subscribers: [steamId],
      });
      steamService.getGameNews.mockResolvedValueOnce([
        makeNewsItem({ gid: 'gid-new', date: nowSec }),
      ]);

      await request(app)
        .get(`/api/news/feed?steamId=${steamId}`)
        .set(authHeader(steamId));

      const state = await UserNewsState.findOne({
        steamId,
        appId: '730',
        newsId: 'gid-new',
      }).lean();
      expect(state).toBeTruthy();
      expect(state.inFeedAt).toBeInstanceOf(Date);
    });

    it('filtre les news hors fenêtre 14j (sauf favorites)', async () => {
      const steamId = nextSteamId();
      const nowSec = Math.floor(Date.now() / 1000);
      const oldSec = nowSec - 30 * 24 * 60 * 60; // 30j
      await createUser({ steamId, followedGames: ['730'] });
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        subscribers: [steamId],
      });

      steamService.getGameNews.mockResolvedValueOnce([
        makeNewsItem({ gid: 'old', date: oldSec }),
        makeNewsItem({ gid: 'recent', date: nowSec }),
      ]);

      const r = await request(app)
        .get(`/api/news/feed?steamId=${steamId}`)
        .set(authHeader(steamId));
      expect(r.body.items).toHaveLength(1);
      expect(r.body.items[0].news.id).toBe('recent');
    });

    it('favoritesOnly=true ne renvoie que les favoris', async () => {
      const steamId = nextSteamId();
      const nowSec = Math.floor(Date.now() / 1000);
      await createUser({
        steamId,
        followedGames: ['730'],
        newsFavorites: [
          {
            appId: '730',
            newsId: 'fav-news',
            newsDate: new Date(nowSec * 1000),
            createdAt: new Date(),
          },
        ],
      });
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        subscribers: [steamId],
      });
      steamService.getGameNews.mockResolvedValueOnce([
        makeNewsItem({ gid: 'fav-news', date: nowSec }),
        makeNewsItem({ gid: 'other', date: nowSec - 100 }),
      ]);

      const r = await request(app)
        .get(`/api/news/feed?steamId=${steamId}&favoritesOnly=true`)
        .set(authHeader(steamId));
      expect(r.body.items).toHaveLength(1);
      expect(r.body.items[0].news.id).toBe('fav-news');
      expect(r.body.items[0].isFavorite).toBe(true);
      expect(r.body.metadata.favoriteStats).toMatchObject({
        hasFavorites: true,
        favoritesOnly: true,
        count: 1,
      });
    });

    it('utilise la langue du user si query.language absent', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        language: 'en',
        followedGames: ['730'],
      });
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        subscribers: [steamId],
      });
      steamService.getGameNews.mockResolvedValueOnce([]);

      await request(app)
        .get(`/api/news/feed?steamId=${steamId}`)
        .set(authHeader(steamId));
      expect(steamService.getGameNews).toHaveBeenCalledWith(
        '730',
        expect.any(Number),
        undefined,
        'en',
      );
    });

    it('clampe limit et perGameLimit', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'] });
      await createGameSubscription({ gameId: '730', subscribers: [steamId], name: 'A' });
      steamService.getGameNews.mockResolvedValueOnce([]);

      const r = await request(app)
        .get(`/api/news/feed?steamId=${steamId}&limit=99999&perGameLimit=999`)
        .set(authHeader(steamId));
      expect(r.status).toBe(200);
      expect(steamService.getGameNews).toHaveBeenCalledWith('730', 20, undefined, 'fr');
    });
  });
});
