/**
 * Utilitaires pour formater les données des jeux Steam
 */

/**
 * Formate un jeu Steam avec toutes ses données
 * @param {Object} game - Jeu Steam brut
 * @param {number} lastUpdateTimestamp - Timestamp de dernière mise à jour
 * @returns {Object} - Jeu formaté
 */
function formatGame(game, lastUpdateTimestamp = 0) {
  const appId = game.appid.toString();

  return {
    appid: appId, // Utiliser appid (lowercase) pour compatibilité mobile
    appId, // Garder appId aussi pour compatibilité
    name: game.name,
    logoUrl: game.img_logo_url
      ? `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_logo_url}.jpg`
      : null,
    iconUrl: game.img_icon_url
      ? `http://media.steampowered.com/steamcommunity/public/images/apps/${game.appid}/${game.img_icon_url}.jpg`
      : null,
    playtime: {
      forever: game.playtime_forever || 0,
      recent: game.playtime_2weeks || 0,
    },
    lastUpdateTimestamp,
  };
}

/**
 * Récupère le timestamp de dernière mise à jour pour un jeu
 * @param {string} appId - ID de l'application
 * @param {Object} user - Utilisateur (optionnel)
 * @returns {number} - Timestamp
 */
function getLastUpdateTimestamp(appId, user = null) {
  let lastUpdateTimestamp = 0;

  // Vérifier dans le cache global
  if (global.gameNewsCache && global.gameNewsCache[appId]) {
    lastUpdateTimestamp = global.gameNewsCache[appId].timestamp;
  }
  // Sinon, vérifier dans les jeux suivis de l'utilisateur
  else if (user && user.followedGames) {
    const followedGame = user.followedGames.find((g) => g.appId === appId);
    if (followedGame && followedGame.lastUpdateTimestamp) {
      lastUpdateTimestamp = followedGame.lastUpdateTimestamp;
    }
  }

  return lastUpdateTimestamp;
}

/**
 * Met à jour le cache global avec un nouveau timestamp
 * @param {string} appId - ID de l'application
 * @param {number} timestamp - Nouveau timestamp
 */
function updateGameCache(appId, timestamp) {
  if (!global.gameNewsCache) {
    global.gameNewsCache = {};
  }

  if (timestamp > 0) {
    global.gameNewsCache[appId] = {
      timestamp,
      updated: Date.now(),
    };
  }
}

module.exports = {
  formatGame,
  getLastUpdateTimestamp,
  updateGameCache,
};
