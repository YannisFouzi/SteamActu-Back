const express = require('express');
const cookieParser = require('cookie-parser');

const errorHandler = require('../../src/middleware/errorHandler');
const {
  SECURITY_CONFIG,
  CORS_OPTIONS,
} = require('../../src/config/app');

/**
 * Construit une instance Express minimale pour les tests d'intégration.
 * Pas de Sentry, pas d'Agenda, pas de rate-limiter (les tests veulent
 * pouvoir hammer les routes sans 429).
 *
 * Usage :
 *   const app = createTestApp({ mount: ['users', 'news'] });
 *   await request(app).get('/api/users/123');
 *
 * @param {Object} opts
 * @param {string[]} [opts.mount] - Liste des routers à monter
 *   ('users'|'news'|'steam'|'auth'|'admin'|'feedback'|'mobileAdmin').
 *   Si vide ou absent, monte TOUS les routers.
 */
function createTestApp(opts = {}) {
  const requested = Array.isArray(opts.mount) ? opts.mount : null;

  const app = express();
  app.use(express.json());

  if (SECURITY_CONFIG.ADMIN_SESSION_SECRET) {
    app.use('/admin', cookieParser(SECURITY_CONFIG.ADMIN_SESSION_SECRET));
  }

  const should = (name) => !requested || requested.includes(name);

  if (should('auth')) {
    const authRoutes = require('../../src/routes/auth');
    app.use('/auth', authRoutes);
  }
  if (should('users')) {
    const userRoutes = require('../../src/routes/users');
    app.use('/api/users', userRoutes);
  }
  if (should('news')) {
    const newsRoutes = require('../../src/routes/news');
    app.use('/api/news', newsRoutes);
  }
  if (should('steam')) {
    const steamRoutes = require('../../src/routes/steam');
    app.use('/api/steam', steamRoutes);
  }
  if (should('feedback')) {
    const feedbackRoutes = require('../../src/routes/feedback');
    app.use('/api/feedback', feedbackRoutes);
  }
  if (should('mobileAdmin')) {
    const mobileAdminRoutes = require('../../src/routes/mobileAdmin');
    app.use('/api/admin', mobileAdminRoutes);
  }
  if (should('admin')) {
    const adminRoutes = require('../../src/routes/admin');
    app.use('/admin', adminRoutes);
  }

  app.use(errorHandler);
  return app;
}

module.exports = { createTestApp, CORS_OPTIONS };
