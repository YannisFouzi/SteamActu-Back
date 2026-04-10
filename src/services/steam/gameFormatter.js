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
  const rawLastPlayed = Number(game.rtime_last_played);
  const normalizedLastPlayed =
    Number.isFinite(rawLastPlayed) && rawLastPlayed > 0
      ? rawLastPlayed
      : null;

  return {
    appid: appId, // Utiliser appid (lowercase) pour compatibilité mobile
    appId, // Garder appId aussi pour compatibilité
    name: game.name,
    header_image: (game.header_image && game.header_image !== 'none')
      ? game.header_image
      : `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${game.appid}/header.jpg`,
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
    rtime_last_played: normalizedLastPlayed,
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

module.exports = {
  formatGame,
  getLastUpdateTimestamp,
};
