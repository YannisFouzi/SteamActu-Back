const express = require('express');
const request = require('supertest');

const {
  steamLimiter,
  authLimiter,
  apiLimiter,
  adminLimiter,
  feedbackLimiter,
} = require('../../../src/middleware/rateLimiter');

function buildApp(limiter, route = '/test') {
  const app = express();
  app.use(route, limiter, (req, res) => res.json({ ok: true }));
  return app;
}

async function hit(app, route = '/test', n = 1) {
  let lastStatus;
  for (let i = 0; i < n; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const r = await request(app).get(route);
    lastStatus = r.status;
  }
  return lastStatus;
}

describe('middleware/rateLimiter', () => {
  describe('steamLimiter (10/min)', () => {
    it('autorise 10 requêtes puis 429 sur la 11e', async () => {
      const app = buildApp(steamLimiter);
      expect(await hit(app, '/test', 10)).toBe(200);
      const r = await request(app).get('/test');
      expect(r.status).toBe(429);
      expect(r.body).toEqual({
        message: 'Too many requests to Steam API routes. Try again later.',
      });
    });

    it('skip les chemins /status/, /games/, /wishlist/ (pas de compte)', async () => {
      const app = express();
      app.use(steamLimiter, (req, res) => res.json({ ok: true }));
      for (let i = 0; i < 20; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const r = await request(app).get('/status/games');
        expect(r.status).toBe(200);
      }
    });
  });

  describe('authLimiter (10/min)', () => {
    it('429 après 10 hits', async () => {
      const app = buildApp(authLimiter);
      expect(await hit(app, '/test', 10)).toBe(200);
      const r = await request(app).get('/test');
      expect(r.status).toBe(429);
    });
  });

  describe('apiLimiter (60/min)', () => {
    it('autorise 60 puis 429', async () => {
      const app = buildApp(apiLimiter);
      expect(await hit(app, '/test', 60)).toBe(200);
      const r = await request(app).get('/test');
      expect(r.status).toBe(429);
    });
  });

  describe('feedbackLimiter (3/min)', () => {
    it('429 après 3 hits', async () => {
      const app = buildApp(feedbackLimiter);
      expect(await hit(app, '/test', 3)).toBe(200);
      const r = await request(app).get('/test');
      expect(r.status).toBe(429);
    });
  });

  describe('adminLimiter (30/min)', () => {
    it('autorise 30 puis 429', async () => {
      const app = buildApp(adminLimiter);
      expect(await hit(app, '/test', 30)).toBe(200);
      const r = await request(app).get('/test');
      expect(r.status).toBe(429);
    });
  });
});
