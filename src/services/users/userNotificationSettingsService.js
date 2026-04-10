/**
 * Parsing et application des paramètres de notification utilisateur (PUT /notifications).
 * Extrait depuis routes/users.js pour garder les handlers minces.
 */

const FOLLOW_MODES = ['off', 'auto', 'prompt'];

/**
 * @param {string} fieldName
 * @param {unknown} value
 * @returns {string|undefined}
 */
function parseFollowMode(fieldName, value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (!FOLLOW_MODES.includes(normalized)) {
      throw new Error(
        `${fieldName} doit être l'une des valeurs suivantes: ${FOLLOW_MODES.join(', ')}`
      );
    }
    return normalized;
  }

  if (typeof value === 'boolean') {
    return value ? 'auto' : 'off';
  }

  throw new Error(
    `${fieldName} doit être une chaîne (off|auto|prompt) ou un booléen`
  );
}

/**
 * @param {string} fieldName
 * @param {unknown} value
 * @returns {boolean|undefined}
 */
function parseOptionalBoolean(fieldName, value) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const lowered = value.toLowerCase().trim();
    if (['true', '1', 'yes'].includes(lowered)) {
      return true;
    }
    if (['false', '0', 'no'].includes(lowered)) {
      return false;
    }
  }

  throw new Error(
    `${fieldName} doit être un booléen ou une chaîne 'true'/'false'`
  );
}

/**
 * Construit le patch à appliquer sur user.notificationSettings à partir du body HTTP.
 *
 * @param {object} body - req.body
 * @returns {{ ok: true, patch: Record<string, unknown> } | { ok: false, message: string }}
 */
function buildNotificationSettingsPatch(body) {
  const {
    enabled,
    newsNotifications,
    followPromptNotifications,
    libraryFollowMode,
    wishlistFollowMode,
    autoFollowNewGames,
    autoFollowWishlistGames,
  } = body;

  let resolvedNewsNotifications;
  let resolvedFollowPromptNotifications;
  try {
    const legacyEnabled = parseOptionalBoolean('enabled', enabled);
    resolvedNewsNotifications =
      parseOptionalBoolean('newsNotifications', newsNotifications) ??
      legacyEnabled;
    resolvedFollowPromptNotifications =
      parseOptionalBoolean(
        'followPromptNotifications',
        followPromptNotifications
      ) ?? legacyEnabled;
  } catch (validationError) {
    return { ok: false, message: validationError.message };
  }

  const patch = {};

  try {
    const resolvedLibraryMode = parseFollowMode(
      'libraryFollowMode',
      libraryFollowMode !== undefined ? libraryFollowMode : autoFollowNewGames
    );
    if (resolvedLibraryMode !== undefined) {
      patch.libraryFollowMode = resolvedLibraryMode;
    }

    const resolvedWishlistMode = parseFollowMode(
      'wishlistFollowMode',
      wishlistFollowMode !== undefined
        ? wishlistFollowMode
        : autoFollowWishlistGames
    );
    if (resolvedWishlistMode !== undefined) {
      patch.wishlistFollowMode = resolvedWishlistMode;
    }
  } catch (validationError) {
    return { ok: false, message: validationError.message };
  }

  if (resolvedNewsNotifications !== undefined) {
    patch.newsNotifications = resolvedNewsNotifications;
  }

  if (resolvedFollowPromptNotifications !== undefined) {
    patch.followPromptNotifications = resolvedFollowPromptNotifications;
  }

  return { ok: true, patch };
}

/**
 * Applique le patch sur le document Mongoose user (mutation en place).
 *
 * @param {object} user - document User Mongoose
 * @param {Record<string, unknown>} patch
 */
function applyNotificationSettingsPatchToUser(user, patch) {
  if (!user.notificationSettings) {
    user.notificationSettings = {};
  }
  Object.assign(user.notificationSettings, patch);
}

module.exports = {
  buildNotificationSettingsPatch,
  applyNotificationSettingsPatchToUser,
};
