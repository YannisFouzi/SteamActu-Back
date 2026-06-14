// Mock du subscriptionManager : on teste la route, pas SteamGridDB/Store.
const subscriptionManagerMock = {
  addUserToGameSubscription: jest.fn().mockResolvedValue(undefined),
  removeUserFromGameSubscription: jest.fn().mockResolvedValue(false),
};
jest.doMock(
  '../../../src/services/users/subscriptionManager',
  () => subscriptionManagerMock,
);

const request = require('supertest');
const { createTestApp } = require('../../helpers/createTestApp');
const { createUser, nextSteamId } = require('../../helpers/factories');
const User = require('../../../src/models/User');

const app = createTestApp({ mount: ['web'] });

describe('webApi — follow à deux niveaux (cloche / +)', () => {
  beforeEach(() => {
    subscriptionManagerMock.addUserToGameSubscription.mockClear();
  });

  describe('GET /api/web/follow', () => {
    it('suit en notifié par défaut (rétrocompat clients existants)', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app)
        .get('/api/web/follow')
        .query({ steamId, appId: '730', name: 'CSGO' });
      expect(r.status).toBe(200);

      const u = await User.findOne({ steamId }).lean();
      expect(u.followedGames[0].notifications).toBe(true);
    });

    it('?notifications=false crée un suivi silencieux', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app)
        .get('/api/web/follow')
        .query({ steamId, appId: '730', name: 'CSGO', notifications: 'false' });
      expect(r.status).toBe(200);

      const u = await User.findOne({ steamId }).lean();
      expect(u.followedGames[0].notifications).toBe(false);
    });
  });

  describe('GET /api/web/follow-state/:steamId/:appId', () => {
    it('renvoie { followed: true, notifications: true } pour un suivi notifié', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        followedGames: [{ appId: '730', followedAt: new Date(), notifications: true }],
      });

      const r = await request(app).get(`/api/web/follow-state/${steamId}/730`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ followed: true, notifications: true });
    });

    it('renvoie { followed: true, notifications: false } pour un suivi silencieux', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        followedGames: [{ appId: '730', followedAt: new Date(), notifications: false }],
      });

      const r = await request(app).get(`/api/web/follow-state/${steamId}/730`);
      expect(r.body).toEqual({ followed: true, notifications: false });
    });

    it('entrée legacy sans champ → notifications: true', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'] });

      const r = await request(app).get(`/api/web/follow-state/${steamId}/730`);
      expect(r.body).toEqual({ followed: true, notifications: true });
    });

    it('jeu non suivi → { followed: false, notifications: false }', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app).get(`/api/web/follow-state/${steamId}/730`);
      expect(r.body).toEqual({ followed: false, notifications: false });
    });
  });

  describe('GET|POST /api/web/follow-notifications/:steamId/:appId', () => {
    it('GET ?enabled=false coupe les notifications (proxy Lua)', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'] });

      const r = await request(app)
        .get(`/api/web/follow-notifications/${steamId}/730`)
        .query({ enabled: 'false' });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true, appId: '730', notifications: false });

      const u = await User.findOne({ steamId }).lean();
      expect(u.followedGames[0].notifications).toBe(false);
      expect(u.followedGames).toHaveLength(1); // jamais désabonné
    });

    it('POST { enabled: true } réactive (SPA)', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        followedGames: [{ appId: '730', followedAt: new Date(), notifications: false }],
      });

      const r = await request(app)
        .post(`/api/web/follow-notifications/${steamId}/730`)
        .send({ enabled: true });
      expect(r.status).toBe(200);

      const u = await User.findOne({ steamId }).lean();
      expect(u.followedGames[0].notifications).toBe(true);
    });

    it('POST ?enabled=false en QUERY coupe les notifs (extension + SPA postent le flag en query)', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        followedGames: [{ appId: '730', followedAt: new Date(), notifications: true }],
      });

      // POST sans body, flag en query — le cas qui renvoyait 400 avant le fix.
      const r = await request(app).post(
        `/api/web/follow-notifications/${steamId}/730?enabled=false`,
      );
      expect(r.status).toBe(200);

      const u = await User.findOne({ steamId }).lean();
      expect(u.followedGames[0].notifications).toBe(false);
    });

    it('400 si enabled absent/invalide', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'] });

      let r = await request(app).get(`/api/web/follow-notifications/${steamId}/730`);
      expect(r.status).toBe(400);

      r = await request(app)
        .get(`/api/web/follow-notifications/${steamId}/730`)
        .query({ enabled: 'oui' });
      expect(r.status).toBe(400);
    });

    it('404 si le jeu n\'est pas suivi', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app)
        .get(`/api/web/follow-notifications/${steamId}/730`)
        .query({ enabled: 'false' });
      expect(r.status).toBe(404);
    });

    it('400 si SteamID invalide', async () => {
      const r = await request(app)
        .get('/api/web/follow-notifications/123/730')
        .query({ enabled: 'false' });
      expect(r.status).toBe(400);
    });
  });
});
