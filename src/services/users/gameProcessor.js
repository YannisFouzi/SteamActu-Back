/**
 * Processeur pour les jeux actifs et suivis
 */

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_GAMES = 200;

/**
 * Migre l'ancienne structure de followedGames vers la nouvelle
 * @param {Object} user - Utilisateur
 */
function migrateFollowedGames(user) {
  if (!user.followedGames) {
    user.followedGames = [];
  } else if (
    user.followedGames.length > 0 &&
    typeof user.followedGames[0] === "object"
  ) {
    // Migration à la volée : convertir l'ancienne structure en nouvelle
    user.followedGames = user.followedGames.map((game) => game.appId);
  }
}

/**
 * Sanitise et filtre la liste des jeux actifs
 * @param {Array} games - Liste des jeux bruts
 * @returns {Array} - Jeux sanitisés et triés
 */
function sanitizeActiveGames(games) {
  const now = Date.now();

  return games
    .map((game) => {
      const appId = game?.appId ? String(game.appId) : null;
      const name = game?.name ? String(game.name) : undefined;
      let timestamp = null;

      if (game?.lastNewsDate instanceof Date) {
        timestamp = game.lastNewsDate.getTime();
      } else if (typeof game?.lastNewsDate === "number") {
        timestamp = game.lastNewsDate;
      } else if (typeof game?.lastNewsDate === "string") {
        const parsed = Date.parse(game.lastNewsDate);
        timestamp = Number.isNaN(parsed) ? null : parsed;
      }

      if (!appId || !timestamp) {
        return null;
      }

      return {
        appId,
        name: name || `Jeu ${appId}`,
        lastNewsDate: new Date(timestamp),
      };
    })
    .filter(Boolean)
    .filter((entry) => {
      const time = entry.lastNewsDate.getTime();
      return time >= now - SEVEN_DAYS_MS && time <= now + 60 * 60 * 1000;
    })
    .sort((a, b) => b.lastNewsDate.getTime() - a.lastNewsDate.getTime())
    .slice(0, MAX_ACTIVE_GAMES);
}

module.exports = {
  migrateFollowedGames,
  sanitizeActiveGames,
};
