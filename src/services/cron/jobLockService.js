const JobLock = require('../../models/JobLock');
const { CRON_CONFIG } = require('../../config/app');

function getDayKey(date = new Date()) {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: CRON_CONFIG.TIMEZONE,
  }).format(date);
}

async function acquireLock(job, groupIndex, ttlMs = CRON_CONFIG.LOCK_TTL_MS) {
  const dayKey = getDayKey();
  const ttl =
    Number(ttlMs) > 0 ? Number(ttlMs) : CRON_CONFIG.LOCK_TTL_MS || 0;
  const expiresAt =
    ttl > 0 ? new Date(Date.now() + ttl) : new Date(Date.now() + 60 * 60 * 1000);

  try {
    const result = await JobLock.findOneAndUpdate(
      { job, groupIndex, dayKey },
      { $setOnInsert: { expiresAt } },
      {
        upsert: true,
        new: false,
        rawResult: true,
        setDefaultsOnInsert: true,
      }
    );

    const lastError = result?.lastErrorObject;
    const wasInserted =
      lastError?.updatedExisting === false ||
      Boolean(lastError?.upserted) ||
      result?.value == null;
    return Boolean(wasInserted);
  } catch (error) {
    if (error.code === 11000) {
      // Conflit d'unicité => lock déjà acquis
      return false;
    }
    throw error;
  }
}

module.exports = {
  acquireLock,
};

