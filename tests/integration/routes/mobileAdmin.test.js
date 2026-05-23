const SESSION_SECRET = 's'.repeat(64);
const ADMIN_STEAM_ID = '76561197960287930';
const NON_ADMIN_STEAM_ID = '76561197960287931';

const securityState = {
  ADMIN_STEAM_IDS: [ADMIN_STEAM_ID],
  MOBILE_SESSION_SECRET: SESSION_SECRET,
  MOBILE_SESSION_TTL_MS: 30 * 24 * 60 * 60 * 1000,
};

jest.doMock('../../../src/config/app', () => ({
  SECURITY_CONFIG: securityState,
  CORS_OPTIONS: { origin: '*' },
}));

const statsServiceMock = {
  getAllStats: jest.fn().mockResolvedValue({ overview: {}, polling: {}, crons: {} }),
  getOverview: jest.fn().mockResolvedValue({ counts: {} }),
  getPolling: jest.fn().mockResolvedValue({ tiers: {} }),
  getCrons: jest.fn().mockResolvedValue({ initialized: true, jobs: [] }),
};

jest.doMock('../../../src/services/admin/statsService', () => statsServiceMock);

const request = require('supertest');
const { createTestApp } = require('../../helpers/createTestApp');
const {
  createMobileSession,
} = require('../../../src/services/mobileSessionService');

const app = createTestApp({ mount: ['mobileAdmin'] });

describe('routes /api/admin (mobile)', () => {
  beforeEach(() => {
    Object.values(statsServiceMock).forEach((fn) => fn.mockClear());
  });

  describe('GET /access', () => {
    it('401 sans Authorization', async () => {
      const r = await request(app).get('/api/admin/access');
      expect(r.status).toBe(401);
    });

    it('401 avec token bidon', async () => {
      const r = await request(app)
        .get('/api/admin/access')
        .set('Authorization', 'Bearer fake');
      expect(r.status).toBe(401);
    });

    it('200 + { isAdmin:false } si steamId hors ADMIN_STEAM_IDS', async () => {
      const { token } = createMobileSession(NON_ADMIN_STEAM_ID);
      const r = await request(app)
        .get('/api/admin/access')
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ isAdmin: false });
    });

    it('200 + { isAdmin:true } si admin', async () => {
      const { token } = createMobileSession(ADMIN_STEAM_ID);
      const r = await request(app)
        .get('/api/admin/access')
        .set('Authorization', `Bearer ${token}`);
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ isAdmin: true });
    });
  });

  describe('GET /api/admin/stats[*]', () => {
    let adminToken;
    let nonAdminToken;

    beforeAll(() => {
      adminToken = createMobileSession(ADMIN_STEAM_ID).token;
      nonAdminToken = createMobileSession(NON_ADMIN_STEAM_ID).token;
    });

    it('403 si steamId hors ADMIN_STEAM_IDS', async () => {
      const r = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${nonAdminToken}`);
      expect(r.status).toBe(403);
    });

    it('GET /stats délègue à getAllStats', async () => {
      const r = await request(app)
        .get('/api/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(statsServiceMock.getAllStats).toHaveBeenCalled();
    });

    it('GET /stats/overview délègue à getOverview', async () => {
      const r = await request(app)
        .get('/api/admin/stats/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(statsServiceMock.getOverview).toHaveBeenCalled();
    });

    it('GET /stats/polling délègue à getPolling', async () => {
      const r = await request(app)
        .get('/api/admin/stats/polling')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(statsServiceMock.getPolling).toHaveBeenCalled();
    });

    it('GET /stats/crons délègue à getCrons', async () => {
      const r = await request(app)
        .get('/api/admin/stats/crons')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(200);
      expect(statsServiceMock.getCrons).toHaveBeenCalled();
    });
  });
});
