/**
 * Middleware d'authentification pour les routes /admin.
 *
 * Auth: header `Authorization: Bearer <token>` comparé à `ADMIN_TOKEN`.
 * Comparaison constant-time via `crypto.timingSafeEqual` pour éviter les
 * attaques par timing (voir https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b).
 *
 * Réponses:
 *   - 503 si `ADMIN_TOKEN` n'est pas configuré côté serveur (routes désactivées)
 *   - 401 si header absent, mal formé, ou token invalide
 *   - next() si token valide
 */

const crypto = require('crypto');
const { SECURITY_CONFIG } = require('../config/app');

const BEARER_PREFIX = 'Bearer ';

/**
 * Compare deux strings en temps constant. `timingSafeEqual` exige des Buffers
 * de même longueur ; si longueurs différentes on compare le provided contre
 * lui-même puis on retourne false — évite à la fois un early-return (qui
 * leakerait la longueur attendue) et un throw.
 */
function safeEqual(provided, expected) {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length) {
    // On consomme le même temps qu'une comparaison a/a pour ne pas leak
    // la différence de taille via le temps de réponse.
    crypto.timingSafeEqual(a, a);
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

function adminAuth(req, res, next) {
  const expected = SECURITY_CONFIG.ADMIN_TOKEN;

  if (!expected) {
    return res.status(503).json({
      message: 'Admin routes disabled: ADMIN_TOKEN not configured',
    });
  }

  const header = req.get('authorization');
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    return res.status(401).json({ message: 'Missing or malformed Authorization header' });
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token || !safeEqual(token, expected)) {
    return res.status(401).json({ message: 'Invalid admin token' });
  }

  return next();
}

module.exports = adminAuth;
