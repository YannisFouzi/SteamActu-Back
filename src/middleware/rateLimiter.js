const rateLimit = require('express-rate-limit');

/**
 * Rate limiters par groupe de routes.
 * Store in-memory (suffisant en mono-instance).
 */

const steamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {message: 'Too many requests to Steam API routes. Try again later.'},
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {message: 'Too many authentication attempts. Try again later.'},
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {message: 'Too many requests. Try again later.'},
});

module.exports = {steamLimiter, authLimiter, apiLimiter};
