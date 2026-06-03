const rateLimit = require('express-rate-limit');

/**
 * Rate limiters par groupe de routes.
 * Store in-memory (suffisant en mono-instance).
 */

// Routes qui vivent sous /api/steam mais NE TOUCHENT PAS l'API Steam externe
// (lecture Mongo only). Elles sont skip du steamLimiter strict (10/min) et
// retombent sur apiLimiter (60/min) appliqué au niveau route.
const STEAM_LIMITER_SKIP_PATHS = ['/status/', '/games/', '/wishlist/'];

const steamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {message: 'Too many requests to Steam API routes. Try again later.'},
  skip: req => {
    const path = req.path || '';
    return STEAM_LIMITER_SKIP_PATHS.some(prefix => path.startsWith(prefix));
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {message: 'Too many authentication attempts. Try again later.'},
  // GET /auth/steam/status/<token> is a harmless read the Chrome-extension login
  // polls repeatedly while waiting for the OpenID popup to complete; it must not
  // eat the strict 10/min auth budget. (req.path is mount-relative under /auth.)
  skip: req =>
    req.method === 'GET' && (req.path || '').startsWith('/steam/status/'),
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {message: 'Too many requests. Try again later.'},
});

const feedbackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {message: 'Too many feedback submissions. Try again later.'},
});

// Routes /admin : usage ponctuel (1 dev qui consulte), strict pour
// contenir un brute-force de ADMIN_TOKEN côté proxy avant middleware auth.
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {message: 'Too many admin requests. Try again later.'},
});

module.exports = {
  steamLimiter,
  authLimiter,
  apiLimiter,
  adminLimiter,
  feedbackLimiter,
};
