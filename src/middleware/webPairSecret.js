const crypto = require('crypto');
const User = require('../models/User');
const { isValidSteamId } = require('./steamValidators');
const logger = require('../utils/logger');

// Privacy par appairage (TOFU) pour la surface Steam Desktop / Millennium.
// Le token web Steam etant inrecuperable depuis un plugin, le plugin prouve son
// identite via un secret par-installation (genere localement, enregistre une
// fois via GET /api/web/pair). On ne stocke qu'un hash SHA-256.

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
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
    const provided = req.get('x-gn-secret') || req.query.secret;
    if (secretMatches(provided, user.webPairSecretHash)) {
      return next();
    }
    return res.status(401).json({ message: 'Appairage requis' });
  } catch (error) {
    logger.error({ err: error }, 'web_secret_gate_failed');
    return res.status(500).json({ message: 'Erreur serveur' });
  }
}

module.exports = { hashSecret, secretMatches, requireWebSecretIfPaired };
