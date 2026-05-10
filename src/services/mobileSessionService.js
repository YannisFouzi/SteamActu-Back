const crypto = require('crypto');

const { SECURITY_CONFIG } = require('../config/app');
const { isValidSteamId } = require('../middleware/steamValidators');

const TOKEN_VERSION = 1;
const SIGNATURE_ALGORITHM = 'sha256';

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function sign(value) {
  return crypto
    .createHmac(SIGNATURE_ALGORITHM, SECURITY_CONFIG.MOBILE_SESSION_SECRET)
    .update(value)
    .digest('base64url');
}

function safeEqual(a, b) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  if (left.length !== right.length) {
    crypto.timingSafeEqual(right, right);
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function createMobileSession(steamId) {
  if (!isValidSteamId(steamId)) {
    throw new Error('Cannot create a mobile session for an invalid SteamID');
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + SECURITY_CONFIG.MOBILE_SESSION_TTL_MS;
  const payload = {
    v: TOKEN_VERSION,
    steamId,
    iat: issuedAt,
    exp: expiresAt,
  };
  const encodedPayload = encodePayload(payload);
  const signature = sign(encodedPayload);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

function verifyMobileSessionToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const [encodedPayload, signature, ...extraParts] = token.split('.');
  if (!encodedPayload || !signature || extraParts.length > 0) {
    return null;
  }

  const expectedSignature = sign(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = decodePayload(encodedPayload);

    if (
      payload?.v !== TOKEN_VERSION ||
      !isValidSteamId(payload.steamId) ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp) ||
      Date.now() >= payload.exp
    ) {
      return null;
    }

    return payload;
  } catch (_error) {
    return null;
  }
}

module.exports = {
  createMobileSession,
  verifyMobileSessionToken,
};
