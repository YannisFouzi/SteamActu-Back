// Garde fail-closed des ECRITURES /api/web (requireWebAuth) : un SteamID seul
// (public) ne doit JAMAIS suffire a modifier un compte. On verifie le refus sans
// preuve, le refus avec une mauvaise preuve, et l'acceptation via session Bearer
// OU secret d'appairage. Les LECTURES quasi-publiques (follow-state, settings,
// register, pair) restent volontairement ouvertes.
const subscriptionManagerMock = {
  addUserToGameSubscription: jest.fn().mockResolvedValue(undefined),
  removeUserFromGameSubscription: jest.fn().mockResolvedValue(true),
};
jest.doMock(
  '../../../src/services/users/subscriptionManager',
  () => subscriptionManagerMock,
);

const request = require('supertest');
const { createTestApp } = require('../../helpers/createTestApp');
const { createUser, nextSteamId } = require('../../helpers/factories');
const User = require('../../../src/models/User');
const { createMobileSession } = require('../../../src/services/mobileSessionService');
const { hashSecret } = require('../../../src/middleware/webPairSecret');

const app = createTestApp({ mount: ['web'] });
const bearer = (steamId) => `Bearer ${createMobileSession(steamId).token}`;

// Une requete d'ecriture representative par methode/route gardee. Chaque entree
// produit une requete supertest "nue" (sans auth) sur laquelle on greffe la
// preuve voulue.
function writeRequest(steamId) {
  return [
    ['GET /follow', () => request(app).get('/api/web/follow').query({ steamId, appId: '730' })],
    ['POST /follow', () => request(app).post('/api/web/follow').send({ steamId, appId: '730' })],
    ['DELETE /follow', () => request(app).delete(`/api/web/follow/${steamId}/730`)],
    ['GET /unfollow', () => request(app).get(`/api/web/unfollow/${steamId}/730`)],
    ['GET /follow-notifications', () => request(app).get(`/api/web/follow-notifications/${steamId}/730`).query({ enabled: 'false' })],
    ['POST /follow-notifications', () => request(app).post(`/api/web/follow-notifications/${steamId}/730`).query({ enabled: 'false' })],
    ['PUT /notifications', () => request(app).put(`/api/web/notifications/${steamId}`).send({ newsNotifications: false })],
    ['PUT /language', () => request(app).put(`/api/web/language/${steamId}`).send({ language: 'en' })],
    ['POST /news-favorites', () => request(app).post(`/api/web/news-favorites/${steamId}`).send({ appId: '730', newsId: 'n1', newsDate: Date.now() })],
    ['DELETE /news-favorites', () => request(app).delete(`/api/web/news-favorites/${steamId}/730/n1`)],
    ['PUT /news-seen', () => request(app).put(`/api/web/news-seen/${steamId}`).send({})],
    ['GET /heartbeat', () => request(app).get(`/api/web/heartbeat/${steamId}`)],
    ['POST /check-visibility', () => request(app).post(`/api/web/check-visibility/${steamId}`)],
    ['POST /check-wishlist-visibility', () => request(app).post(`/api/web/check-wishlist-visibility/${steamId}`)],
  ];
}

describe('webApi — garde fail-closed des ecritures (requireWebAuth)', () => {
  describe('refus 401 sans aucune preuve d identite', () => {
    it.each(writeRequest('76561198000009999').map(([n, f]) => [n, f]))(
      '%s → 401 (SteamID seul ne suffit pas)',
      async (_name, make) => {
        const r = await make();
        expect(r.status).toBe(401);
      },
    );

    it('aucune ecriture n a touche la base', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'], language: 'fr' });

      await Promise.all(writeRequest(steamId).map(([, make]) => make()));

      const u = await User.findOne({ steamId }).lean();
      // Langue inchangee, jeu toujours suivi : les writes ont tous ete bloques.
      expect(u.language).toBe('fr');
      expect(u.followedGames).toHaveLength(1);
    });
  });

  describe('refus 401 avec une mauvaise preuve', () => {
    it('Bearer d un AUTRE steamId → 401', async () => {
      const steamId = nextSteamId();
      const attacker = nextSteamId();
      await createUser({ steamId });

      const r = await request(app)
        .put(`/api/web/language/${steamId}`)
        .set('Authorization', bearer(attacker))
        .send({ language: 'en' });
      expect(r.status).toBe(401);
    });

    it('Bearer malforme → 401', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app)
        .put(`/api/web/language/${steamId}`)
        .set('Authorization', 'Bearer not-a-real-token')
        .send({ language: 'en' });
      expect(r.status).toBe(401);
    });

    it('secret incorrect sur un compte appaire → 401', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, webPairSecretHash: hashSecret('le-bon-secret') });

      const r = await request(app)
        .get(`/api/web/heartbeat/${steamId}`)
        .set('X-GN-Secret', 'mauvais-secret');
      expect(r.status).toBe(401);
    });

    it('secret fourni mais compte NON appaire (pas de hash) → 401', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId }); // pas de webPairSecretHash

      const r = await request(app)
        .get(`/api/web/heartbeat/${steamId}`)
        .set('X-GN-Secret', 'nimporte-quoi');
      expect(r.status).toBe(401);
    });

    it('SteamID invalide → 400 (avant meme la verif de preuve)', async () => {
      const r = await request(app).put('/api/web/language/123').send({ language: 'en' });
      expect(r.status).toBe(400);
    });
  });

  describe('acceptation avec une preuve valide', () => {
    it('session Bearer liee au steamId → ecriture acceptee', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, language: 'fr' });

      const r = await request(app)
        .put(`/api/web/language/${steamId}`)
        .set('Authorization', bearer(steamId))
        .send({ language: 'en' });
      expect(r.status).toBe(200);

      const u = await User.findOne({ steamId }).lean();
      expect(u.language).toBe('en');
    });

    it('secret d appairage en header X-GN-Secret → ecriture acceptee', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, webPairSecretHash: hashSecret('s3cr3t') });

      const r = await request(app)
        .get(`/api/web/heartbeat/${steamId}`)
        .set('X-GN-Secret', 's3cr3t');
      expect(r.status).toBe(200);
    });

    it('secret d appairage en ?secret= (proxy Lua http.get) → ecriture acceptee', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, webPairSecretHash: hashSecret('s3cr3t') });

      const r = await request(app)
        .get(`/api/web/follow`)
        .query({ steamId, appId: '730', secret: 's3cr3t' });
      expect(r.status).toBe(200);

      const u = await User.findOne({ steamId }).lean();
      expect(u.followedGames).toHaveLength(1);
    });
  });

  describe('les lectures quasi-publiques restent ouvertes (pas de regression)', () => {
    it('GET /follow-state ne demande aucune preuve', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'] });

      const r = await request(app).get(`/api/web/follow-state/${steamId}/730`);
      expect(r.status).toBe(200);
      expect(r.body.followed).toBe(true);
    });

    it('GET /settings ne demande aucune preuve', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app).get(`/api/web/settings/${steamId}`);
      expect(r.status).toBe(200);
    });
  });
});
