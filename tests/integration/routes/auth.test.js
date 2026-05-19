jest.mock('axios');

jest.doMock('../../../src/services/steamService', () => ({
  registerOrUpdateUser: jest.fn().mockResolvedValue({ steamId: 'x' }),
}));

const securityState = {
  ADMIN_SESSION_SECRET: '',
  MOBILE_REDIRECT_SCHEME: 'steamnotif',
  MOBILE_SESSION_SECRET: 's'.repeat(64),
  MOBILE_SESSION_TTL_MS: 30 * 24 * 60 * 60 * 1000,
};

jest.doMock('../../../src/config/app', () => ({
  SECURITY_CONFIG: securityState,
  CORS_OPTIONS: { origin: '*' },
  ERROR_MESSAGES: {
    INVALID_OPENID: 'Reponse OpenID invalide',
    STEAMID_NOT_FOUND: 'SteamID non trouve dans la reponse',
    AUTH_ERROR: 'Erreur lors de l\'authentification',
    USER_REGISTRATION_ERROR: 'Erreur enregistrement',
  },
  SUCCESS_MESSAGES: {
    USER_AUTHENTICATED: (s) => `auth ${s}`,
  },
}));

const request = require('supertest');
const axios = require('axios');
const { createTestApp } = require('../../helpers/createTestApp');

const app = createTestApp({ mount: ['auth'] });

describe('routes /auth', () => {
  beforeEach(() => {
    axios.post.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('POST /auth/steam/start', () => {
    it('renvoie { authToken, authUrl, expiresAt }', async () => {
      const r = await request(app).post('/auth/steam/start');
      expect(r.status).toBe(200);
      expect(r.body.authToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(r.body.authUrl).toContain('https://steamcommunity.com/openid/login?');
      expect(r.body.authUrl).toContain('openid.mode=checkid_setup');
      expect(new Date(r.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('GET /auth/steam/status/:authToken', () => {
    it('status="expired" si token inconnu', async () => {
      const r = await request(app).get('/auth/steam/status/unknown-token');
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('expired');
    });

    it('status="pending" tant que steamId non assigné', async () => {
      const start = await request(app).post('/auth/steam/start');
      const r = await request(app).get(`/auth/steam/status/${start.body.authToken}`);
      expect(r.body.status).toBe('pending');
    });
  });

  describe('GET /auth/steam/return (validateOpenIdResponse)', () => {
    function buildOpenIdQuery(overrides = {}) {
      return {
        'openid.identity':
          'https://steamcommunity.com/openid/id/76561197960287930',
        'openid.claimed_id':
          'https://steamcommunity.com/openid/id/76561197960287930',
        'openid.sig': 'sig',
        'openid.signed': 'mode,identity,claimed_id',
        'openid.mode': 'id_res',
        ...overrides,
      };
    }

    it('400 si openid.identity manquant', async () => {
      const r = await request(app)
        .get('/auth/steam/return')
        .query(buildOpenIdQuery({ 'openid.identity': undefined }));
      expect(r.status).toBe(400);
    });

    it('403 si Steam rejette la signature', async () => {
      axios.post.mockResolvedValue({ data: 'is_valid:false' });
      const r = await request(app)
        .get('/auth/steam/return')
        .query(buildOpenIdQuery());
      expect(r.status).toBe(403);
    });

    it('302 + redirect vers deep link mobile si signature OK', async () => {
      axios.post.mockResolvedValue({ data: 'is_valid:true' });
      const r = await request(app)
        .get('/auth/steam/return')
        .query(buildOpenIdQuery());

      expect(r.status).toBe(302);
      expect(r.headers.location).toMatch(/^steamnotif:\/\/auth\?steamId=76561197960287930/);
    });

    it('inclut authToken dans le redirect quand fourni', async () => {
      axios.post.mockResolvedValue({ data: 'is_valid:true' });
      const start = await request(app).post('/auth/steam/start');
      const r = await request(app)
        .get('/auth/steam/return')
        .query({ ...buildOpenIdQuery(), authToken: start.body.authToken });

      expect(r.headers.location).toContain(`authToken=${start.body.authToken}`);
    });

    it('flux complet : start → return → status renvoie sessionToken', async () => {
      axios.post.mockResolvedValue({ data: 'is_valid:true' });
      const start = await request(app).post('/auth/steam/start');

      await request(app)
        .get('/auth/steam/return')
        .query({ ...buildOpenIdQuery(), authToken: start.body.authToken });

      const status = await request(app).get(
        `/auth/steam/status/${start.body.authToken}`,
      );
      expect(status.body.status).toBe('succeeded');
      expect(status.body.steamId).toBe('76561197960287930');
      expect(status.body.sessionToken).toBeTruthy();
      expect(new Date(status.body.sessionExpiresAt).getTime()).toBeGreaterThan(
        Date.now(),
      );
    });
  });
});
