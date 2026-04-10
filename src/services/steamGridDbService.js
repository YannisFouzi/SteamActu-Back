/**
 * Service SteamGridDB - Récupère les images haute qualité des jeux Steam
 * API : https://www.steamgriddb.com/api/v2
 *
 * Cascade de recherche :
 *   1. Icons officielles PNG
 *   2. Icons (tout style/format)
 *   3. Logos (images transparentes du titre/logo du jeu)
 *   4. Grids thumbnail (couvertures 256px, dernier recours SteamGridDB)
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
 * Récupère la meilleure image disponible pour un jeu Steam
 * Cascade : icons (official PNG) → icons (all) → logos → grids (thumb)
 * @param {string|number} appId - Steam app ID
 * @returns {Promise<string|null>} URL de l'image ou null
 */
async function getGameImage(appId) {
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

  // 4. Grids thumbnail (couvertures, dernier recours SteamGridDB)
  const grids = await fetchAssets(`/grids/steam/${appId}`);
  if (grids) {
    // Utiliser le thumb (256px) plutôt que l'image complète (600x900)
    const best = [...grids].sort((a, b) => (b.width || 0) - (a.width || 0));
    return best[0].thumb || best[0].url || null;
  }

  return null;
}

module.exports = {
  getGameImage,
};
