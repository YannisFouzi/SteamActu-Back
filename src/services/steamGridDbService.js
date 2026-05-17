/**
 * Service SteamGridDB - Récupère les images haute qualité des jeux Steam
 * API : https://www.steamgriddb.com/api/v2
 *
 * Cascade de recherche :
 *   1. Icons officielles PNG (par appId Steam)
 *   2. Icons tout style (par appId Steam)
 *   3. Logos transparents (par appId Steam)
 *   4. Grids thumbnail (par appId Steam, dernier recours via appId)
 *   5. Recherche par nom (si fourni) → lookup par sgdbId interne. Couvre
 *      les jeux pré-release dont la fiche SteamGridDB existe mais n'est
 *      pas encore liée à l'appId Steam (cas typique : Forza Horizon 6).
 */

const axios = require('axios');
const { STEAMGRIDDB_CONFIG } = require('../config/app');

const client = axios.create({
  baseURL: STEAMGRIDDB_CONFIG.baseUrl,
  timeout: 5000,
  headers: {
    Authorization: `Bearer ${STEAMGRIDDB_CONFIG.apiKey}`,
  },
});

/**
 * Appel API SteamGridDB avec gestion silencieuse des 404
 * @param {string} endpoint - Chemin de l'API (ex: /icons/steam/123)
 * @param {Object} params - Query params optionnels
 * @returns {Promise<Array|null>} Tableau de résultats ou null
 */
async function fetchAssets(endpoint, params = {}) {
  try {
    const res = await client.get(endpoint, { params });
    const data = res.data?.data;
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch (error) {
    if (error.response?.status !== 404) {
      console.error(`[SteamGridDB] Erreur ${endpoint}:`, error.message);
    }
    return null;
  }
}

/**
 * Sélectionne la meilleure image d'une liste (plus haute résolution)
 * @param {Array} assets - Liste d'assets SteamGridDB
 * @returns {string|null} URL de la meilleure image
 */
function pickBest(assets) {
  if (!assets || assets.length === 0) {
    return null;
  }
  const sorted = [...assets].sort((a, b) => (b.width || 0) - (a.width || 0));
  return sorted[0].url || sorted[0].thumb || null;
}

/**
 * Recherche un jeu sur SteamGridDB par nom et retourne son ID interne.
 * Utilisé quand la fiche SteamGridDB existe mais n'est pas encore liée à
 * l'appId Steam (jeux pré-release type Forza Horizon 6).
 *
 * @param {string} gameName - Nom du jeu
 * @returns {Promise<number|null>} ID SteamGridDB interne ou null
 */
async function lookupSgdbIdByName(gameName) {
  if (!gameName || typeof gameName !== 'string') return null;
  const trimmed = gameName.trim();
  if (!trimmed) return null;

  const results = await fetchAssets(
    `/search/autocomplete/${encodeURIComponent(trimmed)}`
  );
  if (!results || results.length === 0) return null;

  // Le premier résultat de l'autocomplete SteamGridDB est le match le plus
  // pertinent (tri interne par popularité + similarité). On l'utilise tel
  // quel — pas de fuzzy matching côté nous pour éviter d'aller au-delà du
  // signal SGDB.
  return results[0]?.id || null;
}

/**
 * Récupère la meilleure image disponible pour un jeu Steam.
 *
 * Cascade :
 *   1-4. Lookups par appId Steam (icons official → icons all → logos → grids)
 *   5.   Si tout a échoué ET gameName fourni : search par nom → lookup par
 *        ID interne SteamGridDB (couvre les jeux pré-release non liés)
 *
 * @param {string|number} appId - Steam app ID
 * @param {string} [gameName] - Nom du jeu (optionnel, active le 5ème étage)
 * @returns {Promise<string|null>} URL de l'image ou null
 */
async function getGameImage(appId, gameName = null) {
  if (!appId || !STEAMGRIDDB_CONFIG.apiKey) {
    return null;
  }

  // 1. Icons officielles PNG (meilleure qualité, carrées)
  const officialPng = await fetchAssets(`/icons/steam/${appId}`, {
    styles: 'official',
    mimes: 'image/png',
  });
  if (officialPng) {
    return pickBest(officialPng);
  }

  // 2. Icons tout style (custom incluses), préférer PNG
  const allIcons = await fetchAssets(`/icons/steam/${appId}`);
  if (allIcons) {
    const pngIcons = allIcons.filter((i) => i.mime === 'image/png');
    return pickBest(pngIcons.length > 0 ? pngIcons : allIcons);
  }

  // 3. Logos (images transparentes du titre du jeu)
  const logos = await fetchAssets(`/logos/steam/${appId}`);
  if (logos) {
    return pickBest(logos);
  }

  // 4. Grids thumbnail (couvertures, dernier recours via appId Steam)
  const grids = await fetchAssets(`/grids/steam/${appId}`);
  if (grids) {
    // Utiliser le thumb (256px) plutôt que l'image complète (600x900)
    const best = [...grids].sort((a, b) => (b.width || 0) - (a.width || 0));
    return best[0].thumb || best[0].url || null;
  }

  // 5. Fallback recherche par nom (jeux pré-release non liés à l'appId)
  if (gameName) {
    const sgdbId = await lookupSgdbIdByName(gameName);
    if (sgdbId) {
      console.log(
        `[SteamGridDB] appId=${appId} non lié → fallback recherche nom "${gameName}" → sgdbId=${sgdbId}`
      );

      // Re-cascade sur l'ID interne : official PNG → tout style → logos
      const officialByName = await fetchAssets(`/icons/game/${sgdbId}`, {
        styles: 'official',
        mimes: 'image/png',
      });
      if (officialByName) return pickBest(officialByName);

      const allByName = await fetchAssets(`/icons/game/${sgdbId}`);
      if (allByName) {
        const pngByName = allByName.filter((i) => i.mime === 'image/png');
        return pickBest(pngByName.length > 0 ? pngByName : allByName);
      }

      const logosByName = await fetchAssets(`/logos/game/${sgdbId}`);
      if (logosByName) return pickBest(logosByName);
    }
  }

  return null;
}

module.exports = {
  getGameImage,
};
