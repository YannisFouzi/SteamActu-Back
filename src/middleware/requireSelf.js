/**
 * Middleware d'autorisation "ownership" — exige que la session mobile
 * (posee par mobileSessionAuth) appartienne au steamId cible de la requete.
 *
 * Doit IMPERATIVEMENT etre monte APRES mobileSessionAuth.
 *
 * Cherche le steamId cible dans, par ordre de priorite :
 *   1. req.params.steamId   (ex. /api/users/:steamId/...)
 *   2. req.query.steamId    (ex. /api/news/feed?steamId=...)
 *   3. req.body.steamId     (ex. POST /api/users/register)
 *
 * Reponses :
 *   - 500 si req.mobileSession est absent (montage incorrect)
 *   - 400 si aucun steamId cible n'est trouve
 *   - 403 si steamId cible != session.steamId
 *   - next() sinon
 */

function resolveTargetSteamId(req) {
  if (req.params && req.params.steamId) {
    return req.params.steamId;
  }
  if (req.query && req.query.steamId) {
    return req.query.steamId;
  }
  if (req.body && req.body.steamId) {
    return req.body.steamId;
  }
  return null;
}

function requireSelf(req, res, next) {
  if (!req.mobileSession || !req.mobileSession.steamId) {
    return res.status(500).json({
      message: 'requireSelf requires mobileSessionAuth to run first',
    });
  }

  const target = resolveTargetSteamId(req);

  if (!target) {
    return res.status(400).json({ message: 'steamId target missing' });
  }

  if (String(target) !== String(req.mobileSession.steamId)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  return next();
}

module.exports = requireSelf;
