/**
 * Store en memoire pour les tentatives d'auth Steam mobile.
 * Chaque tentative expire apres AUTH_TTL_MS.
 *
 * Note : viable uniquement en mono-instance. Si le backend
 * passe en multi-instance ou redemarre frequemment, migrer
 * vers une collection Mongo avec TTL index (meme interface).
 */

const crypto = require('crypto');

const AUTH_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const store = new Map();

function createAttempt() {
  const authToken = crypto.randomUUID();
  const now = Date.now();

  const attempt = {
    authToken,
    steamId: null,
    createdAt: now,
    expiresAt: now + AUTH_TTL_MS,
  };

  store.set(authToken, attempt);
  return attempt;
}

function getAttempt(authToken) {
  const attempt = store.get(authToken);
  if (!attempt) {
    return null;
  }

  if (Date.now() > attempt.expiresAt) {
    store.delete(authToken);
    return { authToken, status: 'expired' };
  }

  return attempt;
}

function markSucceeded(authToken, steamId) {
  const attempt = store.get(authToken);
  if (!attempt) {
    return false;
  }

  if (Date.now() > attempt.expiresAt) {
    store.delete(authToken);
    return false;
  }

  attempt.steamId = steamId;
  return true;
}

// Nettoyage periodique des tentatives expirees.
// .unref() : ce timer ne doit pas, a lui seul, maintenir le process en vie
// (sinon Node/Jest ne peut pas se terminer proprement a la fin des tests).
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, attempt] of store) {
    if (now > attempt.expiresAt) {
      store.delete(token);
    }
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

module.exports = {
  createAttempt,
  getAttempt,
  markSucceeded,
};
