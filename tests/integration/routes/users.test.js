jest.doMock('../../../src/services/steamService', () => ({
  registerOrUpdateUser: jest.fn(),
  getUserGames: jest.fn(),
  getRecentlyPlayedGames: jest.fn(),
  getGameNews: jest.fn(),
  getUserProfile: jest.fn(),
  getUserWishlist: jest.fn(),
  searchGames: jest.fn(),
  SteamApiError: class {},
}));

jest.doMock('../../../src/services/syncWishlistService', () => ({
  syncUserWishlist: jest.fn().mockResolvedValue({ success: true }),
}));

jest.doMock('../../../src/services/users/subscriptionManager', () => ({
  addUserToGameSubscription: jest.fn().mockResolvedValue(),
  removeUserFromGameSubscription: jest.fn().mockResolvedValue(false),
}));

const request = require('supertest');
const { createTestApp } = require('../../helpers/createTestApp');
const steamService = require('../../../src/services/steamService');
const {
  addUserToGameSubscription,
  removeUserFromGameSubscription,
} = require('../../../src/services/users/subscriptionManager');
const User = require('../../../src/models/User');
const {
  createUser,
  nextSteamId,
} = require('../../helpers/factories');

const app = createTestApp({ mount: ['users'] });

describe('routes /api/users', () => {
  beforeEach(() => {
    steamService.registerOrUpdateUser.mockReset();
    addUserToGameSubscription.mockReset().mockResolvedValue();
    removeUserFromGameSubscription.mockReset().mockResolvedValue(false);
  });

  describe('POST /register', () => {
    it('400 si body.steamId invalide', async () => {
      const r = await request(app)
        .post('/api/users/register')
        .send({ steamId: 'abc' });
      expect(r.status).toBe(400);
    });

    it('200 + user créé via steamService.registerOrUpdateUser', async () => {
      steamService.registerOrUpdateUser.mockResolvedValueOnce({
        steamId: '76561197960287930',
        language: 'fr',
      });
      const r = await request(app)
        .post('/api/users/register')
        .send({ steamId: '76561197960287930', language: 'fr' });
      expect(r.status).toBe(200);
      expect(r.body.steamId).toBe('76561197960287930');
      expect(steamService.registerOrUpdateUser).toHaveBeenCalledWith(
        '76561197960287930',
        'fr',
      );
    });

    it('500 si le service throw', async () => {
      steamService.registerOrUpdateUser.mockRejectedValueOnce(new Error('boom'));
      const r = await request(app)
        .post('/api/users/register')
        .send({ steamId: '76561197960287930' });
      expect(r.status).toBe(500);
    });
  });

  describe('GET /:steamId', () => {
    it('400 si steamId invalide', async () => {
      const r = await request(app).get('/api/users/abc');
      expect(r.status).toBe(400);
    });

    it('404 si user inexistant', async () => {
      const r = await request(app).get('/api/users/76561197960287999');
      expect(r.status).toBe(404);
    });

    it('200 + user sérialisé (followedGames en strings)', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730', '570'] });
      const r = await request(app).get(`/api/users/${steamId}`);
      expect(r.status).toBe(200);
      expect(r.body.followedGames.sort()).toEqual(['570', '730']);
    });
  });

  describe('PUT /:steamId/notifications', () => {
    it('400 si payload invalide', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .put(`/api/users/${steamId}/notifications`)
        .send({ libraryFollowMode: 'maybe' });
      expect(r.status).toBe(400);
    });

    it('200 + applique le patch', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .put(`/api/users/${steamId}/notifications`)
        .send({
          newsNotifications: true,
          libraryFollowMode: 'prompt',
          wishlistFollowMode: 'auto',
        });
      expect(r.status).toBe(200);
      const reloaded = await User.findOne({ steamId }).lean();
      expect(reloaded.notificationSettings.newsNotifications).toBe(true);
      expect(reloaded.notificationSettings.libraryFollowMode).toBe('prompt');
      expect(reloaded.notificationSettings.wishlistFollowMode).toBe('auto');
    });
  });

  describe('POST /:steamId/fcm-token', () => {
    it('400 si token manquant ou trop court', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      let r = await request(app)
        .post(`/api/users/${steamId}/fcm-token`)
        .send({ platform: 'android' });
      expect(r.status).toBe(400);

      r = await request(app)
        .post(`/api/users/${steamId}/fcm-token`)
        .send({ token: 'short', platform: 'android' });
      expect(r.status).toBe(400);
    });

    it('400 si platform invalide', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .post(`/api/users/${steamId}/fcm-token`)
        .send({ token: 'a'.repeat(120), platform: 'symbian' });
      expect(r.status).toBe(400);
    });

    it('200 + token ajouté (200, tokensCount=1)', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const token = 'a'.repeat(120);
      const r = await request(app)
        .post(`/api/users/${steamId}/fcm-token`)
        .send({ token, platform: 'android' });
      expect(r.status).toBe(200);
      expect(r.body.tokensCount).toBe(1);

      const reloaded = await User.findOne({ steamId }).lean();
      expect(reloaded.notificationSettings.fcmTokens[0].token).toBe(token);
    });

    it('met à jour platform si token déjà existant (pas de doublon)', async () => {
      const steamId = nextSteamId();
      const token = 'a'.repeat(120);
      await createUser({
        steamId,
        notificationSettings: { fcmTokens: [{ token, platform: 'ios' }] },
      });

      const r = await request(app)
        .post(`/api/users/${steamId}/fcm-token`)
        .send({ token, platform: 'android' });
      expect(r.status).toBe(200);
      expect(r.body.tokensCount).toBe(1);

      const reloaded = await User.findOne({ steamId }).lean();
      expect(reloaded.notificationSettings.fcmTokens[0].platform).toBe('android');
    });
  });

  describe('DELETE /:steamId/fcm-token', () => {
    it('400 si token absent', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .delete(`/api/users/${steamId}/fcm-token`)
        .send({});
      expect(r.status).toBe(400);
    });

    it('404 si token non trouvé', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .delete(`/api/users/${steamId}/fcm-token`)
        .send({ token: 'nonexistent' });
      expect(r.status).toBe(404);
    });

    it('200 + token retiré', async () => {
      const steamId = nextSteamId();
      const token = 'a'.repeat(120);
      await createUser({
        steamId,
        notificationSettings: { fcmTokens: [{ token, platform: 'android' }] },
      });
      const r = await request(app)
        .delete(`/api/users/${steamId}/fcm-token`)
        .send({ token });
      expect(r.status).toBe(200);
      expect(r.body.tokensCount).toBe(0);
    });
  });

  describe('PUT /:steamId/active-games', () => {
    it('400 si games n\'est pas un array', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .put(`/api/users/${steamId}/active-games`)
        .send({ games: 'not-array' });
      expect(r.status).toBe(400);
    });

    it('200 + sanitize + persist', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .put(`/api/users/${steamId}/active-games`)
        .send({
          games: [
            { appId: '730', name: 'CSGO', lastNewsDate: new Date() },
            { appId: '', name: 'invalid' },
          ],
        });
      expect(r.status).toBe(200);
      expect(r.body.recentActiveGames).toHaveLength(1);
      expect(r.body.recentActiveGames[0].appId).toBe('730');
    });
  });

  describe('POST /:steamId/follow', () => {
    it('400 si appId invalide', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .post(`/api/users/${steamId}/follow`)
        .send({ appId: 'abc' });
      expect(r.status).toBe(400);
    });

    it('400 si jeu déjà suivi', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'] });
      const r = await request(app)
        .post(`/api/users/${steamId}/follow`)
        .send({ appId: '730' });
      expect(r.status).toBe(400);
    });

    it('200 + appelle addUserToGameSubscription', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .post(`/api/users/${steamId}/follow`)
        .send({ appId: '730', name: 'CSGO', logoUrl: 'https://img/730.jpg' });
      expect(r.status).toBe(200);
      expect(addUserToGameSubscription).toHaveBeenCalledWith(
        '730',
        steamId,
        'CSGO',
        'https://img/730.jpg',
      );

      const reloaded = await User.findOne({ steamId }).lean();
      expect(reloaded.followedGames[0].appId).toBe('730');
      expect(reloaded.gamesVersion).toBeInstanceOf(Date);
    });
  });

  describe('DELETE /:steamId/follow/:appId', () => {
    it('400 si jeu pas suivi', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app).delete(`/api/users/${steamId}/follow/730`);
      expect(r.status).toBe(400);
    });

    it('200 + retire le follow + appelle removeUserFromGameSubscription', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'] });
      const r = await request(app).delete(`/api/users/${steamId}/follow/730`);
      expect(r.status).toBe(200);
      expect(removeUserFromGameSubscription).toHaveBeenCalledWith('730', steamId);

      const reloaded = await User.findOne({ steamId }).lean();
      expect(reloaded.followedGames).toEqual([]);
    });
  });

  describe('POST + DELETE /:steamId/news-favorites', () => {
    it('400 si champs manquants', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .post(`/api/users/${steamId}/news-favorites`)
        .send({ appId: '730' });
      expect(r.status).toBe(400);
    });

    it('200 + ajoute le favori (idempotent : 2e POST n\'ajoute pas)', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const payload = { appId: '730', newsId: 'n1', newsDate: '2026-05-01' };

      let r = await request(app)
        .post(`/api/users/${steamId}/news-favorites`)
        .send(payload);
      expect(r.body.favorites).toHaveLength(1);

      r = await request(app)
        .post(`/api/users/${steamId}/news-favorites`)
        .send(payload);
      expect(r.body.favorites).toHaveLength(1);
    });

    it('DELETE retire un favori', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        newsFavorites: [
          { appId: '730', newsId: 'n1', newsDate: new Date(), createdAt: new Date() },
        ],
      });
      const r = await request(app).delete(
        `/api/users/${steamId}/news-favorites/730/n1`,
      );
      expect(r.status).toBe(200);
      expect(r.body.favorites).toEqual([]);
    });
  });

  describe('GET /:steamId/followed-games-details', () => {
    it('404 si user inexistant', async () => {
      const r = await request(app).get(
        '/api/users/76561197960287999/followed-games-details',
      );
      expect(r.status).toBe(404);
    });

    it('200 + tableau (vide si aucun followed)', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app).get(`/api/users/${steamId}/followed-games-details`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ followedGames: [] });
    });
  });

  describe('DELETE /:steamId', () => {
    it('404 si user inexistant', async () => {
      const r = await request(app).delete('/api/users/76561197960287999');
      expect(r.status).toBe(404);
    });

    it('200 + supprime user + appelle removeUserFromGameSubscription pour chaque followed', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730', '570'] });

      const r = await request(app).delete(`/api/users/${steamId}`);
      expect(r.status).toBe(200);
      expect(r.body.stats.followedGames).toBe(2);
      expect(removeUserFromGameSubscription).toHaveBeenCalledTimes(2);

      const reloaded = await User.findOne({ steamId });
      expect(reloaded).toBeNull();
    });
  });

  describe('PUT /:steamId/news/seen', () => {
    it('404 si user inexistant et aucun update fait', async () => {
      const r = await request(app)
        .put('/api/users/76561197960287999/news/seen')
        .send({ seenAt: new Date().toISOString() });
      expect(r.status).toBe(404);
    });

    it('400 si seenAt invalide', async () => {
      const r = await request(app)
        .put('/api/users/76561197960287999/news/seen')
        .send({ seenAt: 'not-a-date' });
      expect(r.status).toBe(400);
    });

    it('200 + persiste seenAt et ne recule jamais', async () => {
      const steamId = nextSteamId();
      const earlier = new Date('2026-05-01');
      const later = new Date('2026-05-10');
      await createUser({ steamId, lastNewsFeedSeenAt: earlier });

      const r = await request(app)
        .put(`/api/users/${steamId}/news/seen`)
        .send({ seenAt: later.toISOString() });
      expect(r.status).toBe(200);
      expect(new Date(r.body.lastNewsFeedSeenAt).getTime()).toBe(later.getTime());

      // tentative de recul → reste à later
      const r2 = await request(app)
        .put(`/api/users/${steamId}/news/seen`)
        .send({ seenAt: earlier.toISOString() });
      expect(r2.status).toBe(200);
      expect(new Date(r2.body.lastNewsFeedSeenAt).getTime()).toBe(later.getTime());
    });
  });

  describe('PUT /:steamId/language', () => {
    it('400 si langue non supportée', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      const r = await request(app)
        .put(`/api/users/${steamId}/language`)
        .send({ language: 'jp' });
      expect(r.status).toBe(400);
    });

    it('200 + normalise (en-US → en) et persiste', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, language: 'fr' });
      const r = await request(app)
        .put(`/api/users/${steamId}/language`)
        .send({ language: 'en-US' });
      expect(r.status).toBe(200);
      expect(r.body.language).toBe('en');
    });
  });
});
