/**
 * Helpers pour manipuler User.followedGames (structure [{ appId, followedAt }]).
 *
 * Le schéma Mongo stocke des objets, mais l'API publique (User.toJSON) sérialise
 * followedGames en array de strings (appIds) pour préserver le contrat frontend.
 * L'exception : getFollowedGamesDetailsBySteamId renvoie explicitement followedAt
 * pour permettre le tri "Récents" côté UI.
 */

/**
 * Extrait les appIds (string) d'un user.followedGames.
 * Accepte les formes legacy (array de strings) pour survivre à des users non migrés.
 * @param {Object} user
 * @returns {string[]}
 */
function getFollowedAppIds(user) {
  if (!user || !Array.isArray(user.followedGames)) {
    return [];
  }

  return user.followedGames
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') return entry;
      if (entry.appId) return String(entry.appId);
      return null;
    })
    .filter(Boolean);
}

/**
 * Construit une entrée followedGames à pousser dans Mongo.
 * @param {string} appId
 * @param {boolean} [notifications=true] - false = suivi silencieux (fil sans push)
 * @returns {{ appId: string, followedAt: Date, notifications: boolean }}
 */
function buildFollowedGamesEntry(appId, notifications = true) {
  return {
    appId: String(appId),
    followedAt: new Date(),
    notifications: notifications !== false,
  };
}

/**
 * AppIds suivis en silencieux (notifications coupées). Seul notifications === false
 * compte : les entrées legacy sans le champ restent notifiées.
 * @param {Object} user
 * @returns {Set<string>}
 */
function getMutedAppIds(user) {
  if (!user || !Array.isArray(user.followedGames)) {
    return new Set();
  }
  return new Set(
    user.followedGames
      .filter(
        (entry) =>
          entry &&
          typeof entry === 'object' &&
          entry.appId &&
          entry.notifications === false
      )
      .map((entry) => String(entry.appId))
  );
}

/**
 * Map appId (string) → followedAt (Date) pour les entrées qui le portent.
 * Sert à filtrer les notifications (push/toast) d'une news antérieure au follow :
 * un nouveau follower ne doit jamais être notifié du backlog d'un jeu.
 * Les entrées legacy (string) ou sans followedAt sont absentes de la map →
 * pas de filtrage (rétrocompat, comportement historique préservé).
 * @param {Object} user
 * @returns {Map<string, Date>}
 */
function getFollowedAtByAppId(user) {
  const map = new Map();
  if (!user || !Array.isArray(user.followedGames)) {
    return map;
  }
  user.followedGames.forEach((entry) => {
    if (entry && typeof entry === 'object' && entry.appId && entry.followedAt) {
      map.set(String(entry.appId), new Date(entry.followedAt));
    }
  });
  return map;
}

/**
 * Retourne true si user suit déjà appId.
 * @param {Object} user
 * @param {string} appId
 */
function hasFollowedGame(user, appId) {
  if (!appId) return false;
  return getFollowedAppIds(user).includes(String(appId));
}

module.exports = {
  getFollowedAppIds,
  buildFollowedGamesEntry,
  getMutedAppIds,
  getFollowedAtByAppId,
  hasFollowedGame,
};
