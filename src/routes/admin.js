/**
 * Routes /admin — dashboard operationnel (UI web + API JSON).
 *
 * Structure :
 *   - GET  /admin                 (public, sert le HTML ; la page gere login UI)
 *   - POST /admin/login           (public, rate-limited, verifie password bcrypt)
 *   - POST /admin/logout          (public, clear cookie)
 *   - GET  /admin/stats[*]        (protege par adminAuth, renvoie JSON)
 *
 * Notes securite :
 *   - Login: bcrypt.compare() est lui-meme constant-time (pas besoin de wrap)
 *   - Cookie pose en { httpOnly, signed, sameSite: 'strict', secure: prod }
 *   - Sur echec login : delai constant minimum (via bcrypt.compare sur hash
 *     dummy si hash non configure) -> pas de timing side-channel sur l'existence
 *     d'un compte admin
 *   - CSP nonce-based : genere par requete, bloque toute injection XSS
 *     qui voudrait charger du JS externe ou inline sans nonce
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const router = express.Router();

const { SECURITY_CONFIG, SERVER_CONFIG } = require('../config/app');
const adminAuth = require('../middleware/adminAuth');
const statsService = require('../services/admin/statsService');

const SESSION_COOKIE = adminAuth.SESSION_COOKIE;
const IS_PROD = SERVER_CONFIG.NODE_ENV === 'production';

// Hash bcrypt dummy (password "dummy") pour egaliser le temps de reponse quand
// ADMIN_PASSWORD_HASH n'est pas configure. Sinon l'attaquant verrait que login
// echoue quasi-instantanement (hash absent) vs ~200ms (bcrypt.compare reel).
const DUMMY_HASH = '$2b$12$CjwC4gq5JavL1tQKqrBCxOoYPH2Fz6bBuNRzjTgP0U76NQcV1TOjW';

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ── Template HTML avec CSP nonce ─────────────────────────────────────────────

const HTML_TEMPLATE_PATH = path.join(__dirname, '..', 'views', 'admin.html');
// Lu une seule fois au boot (pas de watch necessaire, le fichier est statique)
const HTML_TEMPLATE = fs.readFileSync(HTML_TEMPLATE_PATH, 'utf8');

function renderDashboard(req, res) {
  const nonce = crypto.randomBytes(16).toString('base64');

  // CSP strict :
  //   - default-src 'self' : tout doit venir du meme origin
  //   - script-src 'nonce-X' : seul le <script nonce="X"> inline passe
  //   - style-src 'nonce-X' 'self' : idem pour CSS inline
  //   - img-src 'self' data: : images locales + data URIs (icones SVG inline)
  //   - connect-src 'self' : fetch() restreint au meme origin
  //   - object-src 'none' : bloque <object>, <embed>, Flash legacy
  //   - base-uri 'self' : empeche <base> injection
  //   - form-action 'self' : <form> ne peut submit ailleurs
  //   - frame-ancestors 'none' : bloque l'embed dans un iframe tiers (clickjacking)
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      `script-src 'nonce-${nonce}'`,
      `style-src 'nonce-${nonce}'`,
      "img-src 'self' data:",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');

  const html = HTML_TEMPLATE.replace(/__NONCE__/g, nonce);
  res.type('html').send(html);
}

// ── Routes publiques (pas de adminAuth) ──────────────────────────────────────

router.get('/', renderDashboard);

router.post(
  '/login',
  express.json(),
  asyncHandler(async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const storedHash = SECURITY_CONFIG.ADMIN_PASSWORD_HASH;
    const hashToCompare = storedHash || DUMMY_HASH;

    const ok = await bcrypt.compare(password, hashToCompare);

    if (!storedHash || !ok) {
      // Meme message d'erreur quel que soit le cas -> pas de leak d'info
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const sessionSecret = SECURITY_CONFIG.ADMIN_SESSION_SECRET;
    if (!sessionSecret) {
      return res
        .status(503)
        .json({ message: 'Session disabled: ADMIN_SESSION_SECRET not configured' });
    }

    const maxAge = SECURITY_CONFIG.ADMIN_SESSION_MAX_AGE_MS;
    const value = `${Date.now()}.${maxAge}`;

    res.cookie(SESSION_COOKIE, value, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      signed: true,
      maxAge,
      path: '/admin',
    });

    return res.status(204).end();
  })
);

router.post('/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/admin' });
  res.status(204).end();
});

// ── Routes protegees (stats JSON) ────────────────────────────────────────────

router.get(
  '/stats',
  adminAuth,
  asyncHandler(async (req, res) => {
    const data = await statsService.getAllStats();
    res.json(data);
  })
);

router.get(
  '/stats/overview',
  adminAuth,
  asyncHandler(async (req, res) => {
    const data = await statsService.getOverview();
    res.json(data);
  })
);

router.get(
  '/stats/polling',
  adminAuth,
  asyncHandler(async (req, res) => {
    const data = await statsService.getPolling();
    res.json(data);
  })
);

router.get(
  '/stats/crons',
  adminAuth,
  asyncHandler(async (req, res) => {
    const data = await statsService.getCrons();
    res.json(data);
  })
);

module.exports = router;
