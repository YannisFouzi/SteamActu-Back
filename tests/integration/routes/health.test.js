/**
 * Tests d'integration du healthcheck.
 *
 * - Mongo : mongoose est connecte par jestSetup (Memory Server), on lit
 *   l'etat reel pour le happy path. Pour simuler "mongo down" sans casser
 *   les autres tests on isole un sous-app avec un mock module.
 * - Agenda : on mock getAgenda() qui est lui-meme externe a mongoose.
 */

const express = require('express');
const request = require('supertest');

jest.doMock('../../../src/config/cron', () => ({
  getAgenda: jest.fn(),
}));

const { getAgenda } = require('../../../src/config/cron');
const healthRoutes = require('../../../src/routes/health');

function buildApp() {
  const app = express();
  app.use('/healthz', healthRoutes);
  return app;
}

describe('GET /healthz', () => {
  beforeEach(() => {
    getAgenda.mockReset();
  });

  it('200 + status=ok quand Mongo connecte (reel) ET Agenda initialise', async () => {
    getAgenda.mockReturnValue({ jobs: jest.fn() });

    const r = await request(buildApp()).get('/healthz');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
    expect(r.body.checks.mongo).toBe('ok');
    expect(r.body.checks.agenda).toBe('ok');
    expect(typeof r.body.checks.uptime_seconds).toBe('number');
  });

  it('503 si Agenda non initialise', async () => {
    getAgenda.mockReturnValue(null);

    const r = await request(buildApp()).get('/healthz');
    expect(r.status).toBe(503);
    expect(r.body.status).toBe('degraded');
    expect(r.body.checks.agenda).toBe('down');
  });
});

describe('GET /healthz — mongo down (module mock)', () => {
  let appWithMongoDown;

  beforeAll(() => {
    jest.isolateModules(() => {
      jest.doMock('mongoose', () => ({
        connection: { readyState: 0 },
      }));
      jest.doMock('../../../src/config/cron', () => ({
        getAgenda: jest.fn().mockReturnValue({ jobs: jest.fn() }),
      }));
      const routes = require('../../../src/routes/health');
      const app = express();
      app.use('/healthz', routes);
      appWithMongoDown = app;
    });
  });

  it('503 + checks.mongo signale "down (disconnected)"', async () => {
    const r = await request(appWithMongoDown).get('/healthz');
    expect(r.status).toBe(503);
    expect(r.body.status).toBe('degraded');
    expect(r.body.checks.mongo).toContain('down');
    expect(r.body.checks.mongo).toContain('disconnected');
  });
});
