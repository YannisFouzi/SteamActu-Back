/**
 * Helper de tests d'integration : forge un header Authorization Bearer
 * porteur d'une vraie session mobile signee, via le service de prod.
 *
 * Usage :
 *   const { authHeader } = require('../../helpers/authHeaders');
 *   await request(app)
 *     .get(`/api/users/${steamId}`)
 *     .set(authHeader(steamId));
 *
 *   // Ou pour simuler un attaquant qui presente un token valide
 *   // pour SON propre steamId en essayant d'acceder a celui de la victime :
 *   .set(authHeader(attackerSteamId))
 */

const {
  createMobileSession,
} = require('../../src/services/mobileSessionService');

function bearerFor(steamId) {
  const { token } = createMobileSession(steamId);
  return `Bearer ${token}`;
}

function authHeader(steamId) {
  return { Authorization: bearerFor(steamId) };
}

module.exports = { authHeader, bearerFor };
