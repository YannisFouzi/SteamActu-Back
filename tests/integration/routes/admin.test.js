const bcrypt = require('bcryptjs');

const PASSWORD = 'p@ssw0rd-secure';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const ADMIN_TOKEN = 'a'.repeat(64);
const SESSION_SECRET = 'b'.repeat(64);

const securityState = {
  ADMIN_TOKEN,
  ADMIN_PASSWORD_HASH: PASSWORD_HASH,
  ADMIN_SESSION_SECRET: SESSION_SECRET,
  ADMIN_SESSION_MAX_AGE_MS: 24 * 60 * 60 * 1000,
};
const serverConfig = { NODE_ENV: 'test', PORT: 5000, MONGODB_URI: 'x' };

jest.doMock('../../../src/config/app', () => ({
  SECURITY_CONFIG: securityState,
  SERVER_CONFIG: serverConfig,
  CORS_OPTIONS: { origin: '*' },
}));

const statsServiceMock = {
  getAllStats: jest.fn(),
  getOverview: jest.fn(),
  getPolling: jest.fn(),
  getCrons: jest.fn(),
};

jest.doMock('../../../src/services/admin/statsService', () => statsServiceMock);

const request = require('supertest');
const { createTestApp } = require('../../helpers/createTestApp');

const app = createTestApp({ mount: ['admin'] });

describe('routes /admin', () => {
  beforeEach(() => {
    Object.values(statsServiceMock).forEach((fn) => fn.mockReset());
  });

  describe('GET /admin (HTML dashboard public)', () => {
    it('200 + content-type text/html', async () => {
      const r = await request(app).get('/admin');
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/html/);
    });

    it('headers de sécurité présents (CSP nonce, frame-options, etc.)', async () => {
      const r = await request(app).get('/admin');
      expect(r.headers['content-security-policy']).toMatch(/nonce-/);
      expect(r.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['x-frame-options']).toBe('DENY');
      expect(r.headers['referrer-policy']).toBe('no-referrer');
    });

    it('chaque rendu génère un nonce différent', async () => {
      const r1 = await request(app).get('/admin');
      const r2 = await request(app).get('/admin');
      const nonce1 = r1.headers['content-security-policy'].match(/nonce-([\w/+=]+)/)[1];
      const nonce2 = r2.headers['content-security-policy'].match(/nonce-([\w/+=]+)/)[1];
      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe('POST /admin/login', () => {
    it('204 + cookie signé si password correct', async () => {
      const r = await request(app)
        .post('/admin/login')
        .send({ password: PASSWORD });
      expect(r.status).toBe(204);
      expect(r.headers['set-cookie']).toBeDefined();
      expect(r.headers['set-cookie'][0]).toMatch(/admin_session=/);
      expect(r.headers['set-cookie'][0]).toMatch(/HttpOnly/);
      expect(r.headers['set-cookie'][0]).toMatch(/SameSite=Strict/);
      expect(r.headers['set-cookie'][0]).toMatch(/Path=\/admin/);
    });

    it('401 si password invalide', async () => {
      const r = await request(app)
        .post('/admin/login')
        .send({ password: 'wrong' });
      expect(r.status).toBe(401);
    });

    it('401 si body vide', async () => {
      const r = await request(app).post('/admin/login').send({});
      expect(r.status).toBe(401);
    });

    it('401 (et bcrypt.compare DUMMY) si ADMIN_PASSWORD_HASH non configuré', async () => {
      securityState.ADMIN_PASSWORD_HASH = '';
      try {
        const r = await request(app)
          .post('/admin/login')
          .send({ password: 'whatever' });
        expect(r.status).toBe(401);
      } finally {
        securityState.ADMIN_PASSWORD_HASH = PASSWORD_HASH;
      }
    });
  });

  describe('POST /admin/logout', () => {
    it('204 + clear cookie', async () => {
      const r = await request(app).post('/admin/logout');
      expect(r.status).toBe(204);
      expect(r.headers['set-cookie'][0]).toMatch(/admin_session=;/);
    });
  });

  describe('GET /admin/stats (protégé)', () => {
    it('401 sans auth', async () => {
      const r = await request(app).get('/admin/stats');
      expect(r.status).toBe(401);
    });

    it('200 avec Bearer token', async () => {
      statsServiceMock.getAllStats.mockResolvedValueOnce({ ok: true });
      const r = await request(app)
        .get('/admin/stats')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true });
    });

    it('200 avec cookie de session valide (login flow complet)', async () => {
      statsServiceMock.getAllStats.mockResolvedValue({ ok: true });
      const agent = request.agent(app);

      const login = await agent.post('/admin/login').send({ password: PASSWORD });
      expect(login.status).toBe(204);

      const stats = await agent.get('/admin/stats');
      expect(stats.status).toBe(200);
    });

    it('401 avec mauvais Bearer', async () => {
      const r = await request(app)
        .get('/admin/stats')
        .set('Authorization', 'Bearer wrong-token');
      expect(r.status).toBe(401);
    });

    it('GET /admin/stats/overview délègue à statsService.getOverview', async () => {
      statsServiceMock.getOverview.mockResolvedValueOnce({ counts: { users: 5 } });
      const r = await request(app)
        .get('/admin/stats/overview')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ counts: { users: 5 } });
    });

    it('GET /admin/stats/polling délègue à statsService.getPolling', async () => {
      statsServiceMock.getPolling.mockResolvedValueOnce({ tiers: {} });
      const r = await request(app)
        .get('/admin/stats/polling')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ tiers: {} });
    });

    it('GET /admin/stats/crons délègue à statsService.getCrons', async () => {
      statsServiceMock.getCrons.mockResolvedValueOnce({ initialized: false, jobs: [] });
      const r = await request(app)
        .get('/admin/stats/crons')
        .set('Authorization', `Bearer ${ADMIN_TOKEN}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ initialized: false, jobs: [] });
    });
  });
});
