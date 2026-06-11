const request = require('supertest');
const crypto = require('crypto');

const { createTestApp } = require('../../helpers/createTestApp');
const { createUser } = require('../../helpers/factories');
const User = require('../../../src/models/User');

const app = createTestApp({ mount: ['web'] });

const STEAM_ID = '76561197960287930';
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

// Lit le hash (champ select:false) pour vérifier l'état d'appairage en base.
async function readHash(steamId) {
  const u = await User.findOne({ steamId }).select('+webPairSecretHash').lean();
  return u ? u.webPairSecretHash : undefined;
}

describe('GET /api/web/pair', () => {
  // ── Option A : génération serveur quand aucun secret n'est fourni ──────────
  describe('sans secret fourni (flux Option A)', () => {
    it('mint un secret CSPRNG, le renvoie une fois et stocke son hash', async () => {
      await createUser({ steamId: STEAM_ID });

      const r = await request(app).get('/api/web/pair').query({ steamId: STEAM_ID });

      expect(r.status).toBe(200);
      expect(r.body.ok).toBe(true);
      expect(r.body.paired).toBe(true);
      expect(r.body.secret).toMatch(/^[0-9a-f]{40}$/); // 20 octets hex
      expect(await readHash(STEAM_ID)).toBe(sha256(r.body.secret));
    });

    it('ne régénère pas et ne renvoie aucun secret si déjà appairé', async () => {
      const existingHash = sha256('deja-appaire-secret-x');
      await createUser({ steamId: STEAM_ID, webPairSecretHash: existingHash });

      const r = await request(app).get('/api/web/pair').query({ steamId: STEAM_ID });

      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true, alreadyPaired: true });
      expect(r.body.secret).toBeUndefined();
      expect(await readHash(STEAM_ID)).toBe(existingHash); // inchangé
    });
  });

  // ── Rétrocompat : flux TOFU historique (le plugin envoie ses 40 hex) ───────
  describe('avec secret fourni (flux TOFU historique, inchangé)', () => {
    it('pose le hash au 1er appel et ne ré-échoie pas le secret', async () => {
      await createUser({ steamId: STEAM_ID });
      const secret = 'a'.repeat(40);

      const r = await request(app)
        .get('/api/web/pair')
        .query({ steamId: STEAM_ID, secret });

      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true, paired: true });
      expect(await readHash(STEAM_ID)).toBe(sha256(secret));
    });

    it('accepte un secret correspondant', async () => {
      const secret = 'b'.repeat(40);
      await createUser({ steamId: STEAM_ID, webPairSecretHash: sha256(secret) });

      const r = await request(app)
        .get('/api/web/pair')
        .query({ steamId: STEAM_ID, secret });

      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true, paired: true });
    });

    it('rejette un secret incorrect quand déjà appairé (403)', async () => {
      await createUser({ steamId: STEAM_ID, webPairSecretHash: sha256('le-bon') });

      const r = await request(app)
        .get('/api/web/pair')
        .query({ steamId: STEAM_ID, secret: 'c'.repeat(40) });

      expect(r.status).toBe(403);
    });
  });

  // ── Garde-fous communs ─────────────────────────────────────────────────────
  it('rejette un SteamID invalide (400)', async () => {
    const r = await request(app).get('/api/web/pair').query({ steamId: '123' });
    expect(r.status).toBe(400);
  });

  it('renvoie 404 pour un utilisateur inconnu', async () => {
    const r = await request(app).get('/api/web/pair').query({ steamId: STEAM_ID });
    expect(r.status).toBe(404);
  });
});
