/**
 * Auth dual pour les routes /admin :
 *   1. Cookie signe HttpOnly (UI web) — pose par POST /admin/login
 *   2. Bearer token dans header Authorization (API / curl / scripts)
 *
 * N'importe laquelle des deux suffit. Le cookie est prioritaire (verifie en
 * premier) car c'est le cas d'usage dominant pour une session interactive.
 *
 * Securite :
 *   - Cookie signe par HMAC via `cookie-parser` (cle: ADMIN_SESSION_SECRET)
 *     -> impossible a forger
 *   - Verification d'expiration cote serveur (defense en profondeur au-dela
 *     du `maxAge` navigateur)
 *   - Comparaison Bearer en temps constant via `crypto.timingSafeEqual`
 *     (handling des longueurs differentes sans leak)
 *
 * Reponses :
 *   - 503 si aucun mecanisme d'auth n'est configure cote serveur
 *   - 401 si ni cookie ni Bearer valide
 *   - next() sinon
 */

const crypto = require('crypto');
const { SECURITY_CONFIG } = require('../config/app');

const BEARER_PREFIX = 'Bearer ';
const SESSION_COOKIE = 'admin_session';

function safeBearerEqual(provided, expected) {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length) {
    // Temps constant equivalent meme en cas de mismatch de taille
    crypto.timingSafeEqual(a, a);
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

/**
 * Le cookie signe contient `<issuedAtMs>.<maxAgeMs>`. La signature HMAC est
 * validee par `cookie-parser` avant qu'on lise `req.signedCookies` : si la
 * valeur est la, c'est qu'elle n'a pas ete alteree. On re-verifie quand meme
 * que la session n'est pas expiree cote serveur (defense en profondeur).
 */
function isCookieSessionValid(req) {
  const value = req.signedCookies && req.signedCookies[SESSION_COOKIE];
  if (!value || typeof value !== 'string') return false;

  const [issuedAtStr, maxAgeStr] = value.split('.');
  const issuedAt = Number(issuedAtStr);
  const maxAge = Number(maxAgeStr);

  if (!Number.isFinite(issuedAt) || !Number.isFinite(maxAge)) return false;

  return Date.now() < issuedAt + maxAge;
}

function isBearerValid(req) {
  const expected = SECURITY_CONFIG.ADMIN_TOKEN;
  if (!expected) return false;

  const header = req.get('authorization');
  if (!header || !header.startsWith(BEARER_PREFIX)) return false;

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token) return false;

  return safeBearerEqual(token, expected);
}

function adminAuth(req, res, next) {
  const hasAuthConfigured =
    SECURITY_CONFIG.ADMIN_TOKEN ||
    (SECURITY_CONFIG.ADMIN_PASSWORD_HASH && SECURITY_CONFIG.ADMIN_SESSION_SECRET);

  if (!hasAuthConfigured) {
    return res.status(503).json({
      message:
        'Admin routes disabled: set ADMIN_TOKEN or ADMIN_PASSWORD_HASH + ADMIN_SESSION_SECRET',
    });
  }

  if (isCookieSessionValid(req) || isBearerValid(req)) {
    return next();
  }

  // Pour une requete API (pas de Accept: text/html) on renvoie 401 JSON.
  // Pour une requete navigateur on redirige vers la page login — mais /admin
  // gere cette logique lui-meme (route publique). Ici on reste en 401 brut.
  return res.status(401).json({ message: 'Authentication required' });
}

module.exports = adminAuth;
module.exports.SESSION_COOKIE = SESSION_COOKIE;
