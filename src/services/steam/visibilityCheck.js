/**
 * Vérifie si les données de jeux d'un utilisateur Steam sont accessibles.
 * Retourne true si le profil est public (jeux visibles), false sinon.
 *
 * Méthode : tenter un fetchUserGames — si [] → profil privé (ou lib vide).
 * La simulation SIMULATE_PRIVATE_PROFILE est gérée dans apiClient.js,
 * donc cette fonction fonctionne automatiquement en mode simulation.
 */

const { fetchUserGames } = require('./apiClient');

async function checkGamesVisibility(steamId) {
  try {
    const games = await fetchUserGames(steamId);
    const visible = Array.isArray(games) && games.length > 0;

    if (!visible) {
      console.log(`🔒 [VISIBILITY] Profil privé ou bibliothèque vide pour ${steamId}`);
    }

    return visible;
  } catch (error) {
    console.error(`[VISIBILITY] Erreur vérification visibilité pour ${steamId}:`, error.message);
    return false;
  }
}

module.exports = { checkGamesVisibility };
