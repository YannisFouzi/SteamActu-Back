const crypto = require('crypto');
const User = require('../models/User');
const { isValidSteamId } = require('./steamValidators');
const { verifyMobileSessionToken } = require('../services/mobileSessionService');
const logger = require('../utils/logger');

// Privacy par appairage (TOFU) pour la surface Steam Desktop / Millennium.
// Le token web Steam etant inrecuperable depuis un plugin, le plugin prouve son
// identite via un secret par-installation (genere localement, enregistre une
// fois via GET /api/web/pair). On ne stocke qu'un hash SHA-256.

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

// Genere un secret d'appairage fort cote serveur (CSPRNG). 20 octets -> 40 hex,
// meme format que celui historiquement genere par le plugin (qui s'appuyait sur
// math.random, non-crypto). Utilise par GET /api/web/pair sans secret fourni :
// le backend mint le secret et le renvoie UNE fois, garantissant une entropie
// independante du sandbox Lua du plugin.
function generatePairSecret() {
  return crypto.randomBytes(20).toString('hex');
}

function secretMatches(provided, storedHash) {
  if (!provided || !storedHash) {
    return false;
  }
  const a = Buffer.from(hashSecret(provided), 'utf8');
  const b = Buffer.from(String(storedHash), 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Gating SOUPLE : si un secret est enregistre pour ce steamId, exige le bon
// secret (header X-GN-Secret, ou ?secret= pour le proxy Lua qui ne fait que
// http.get) ; sinon laisse passer (compat, rollout non-cassant). Le steamId est
// lu dans req.params.steamId.
async function requireWebSecretIfPaired(req, res, next) {
  try {
    const steamId = req.params.steamId;
    if (!isValidSteamId(String(steamId || ''))) {
      return res.status(400).json({ message: 'SteamID invalide' });
    }
    const user = await User.findOne({ steamId }).select('+webPairSecretHash').lean();
    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }
    if (!user.webPairSecretHash) {
      return next();
    }
    // Surface plugin Millennium : secret par-installation (header/query).
    const provided = req.get('x-gn-secret') || req.query.secret;
    if (secretMatches(provided, user.webPairSecretHash)) {
      return next();
    }
    // Surface navigateur (extension Chrome / web) : session OpenID verifiee.
    const authHeader = req.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const session = verifyMobileSessionToken(authHeader.slice(7).trim());
      if (session && String(session.steamId) === String(steamId)) {
        return next();
      }
    }
    return res.status(401).json({ message: 'Authentification requise' });
  } catch (error) {
    logger.error({ err: error }, 'web_secret_gate_failed');
    return res.status(500).json({ message: 'Erreur serveur' });
  }
}

module.exports = {
  hashSecret,
  generatePairSecret,
  secretMatches,
  requireWebSecretIfPaired,
};
