/**
 * Service d'extraction d'images pour les news Steam
 * Gère la génération des URLs de logos de jeux et l'extraction des images depuis le contenu des news
 */

// URLs CDN Steam officielles
const STEAM_CDN = 'https://cdn.cloudflare.steamstatic.com';
const STEAM_CLAN_CDN = 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans';

/**
 * Génère l'URL du logo PNG d'un jeu Steam
 * Utilise le CDN Cloudflare officiel de Steam
 *
 * @param {string|number} appId - ID de l'application Steam
 * @returns {string} URL du logo PNG
 *
 * @example
 * getGameLogoUrl(570) // => "https://cdn.cloudflare.steamstatic.com/steam/apps/570/logo.png"
 */
function getGameLogoUrl(appId) {
  if (!appId) {
    return null;
  }
  return `${STEAM_CDN}/steam/apps/${appId}/logo.png`;
}

/**
 * Extrait la première image du contenu d'une news Steam
 * Supporte plusieurs formats : BBCode [img], HTML <img>, placeholders {STEAM_CLAN_IMAGE}
 *
 * @param {string} contents - Contenu brut de la news (HTML/BBCode)
 * @returns {string|null} URL de la première image trouvée, ou null si aucune
 *
 * @example
 * extractFirstImage("[img]https://example.com/image.png[/img]")
 * // => "https://example.com/image.png"
 *
 * extractFirstImage("{STEAM_CLAN_IMAGE}/123/abc.png")
 * // => "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans/123/abc.png"
 */
function extractFirstImage(contents) {
  if (!contents || typeof contents !== 'string') {
    return null;
  }

  // 1. Remplacer les placeholders {STEAM_CLAN_IMAGE} par l'URL CDN complète
  const processedContent = contents.replace(
    /{STEAM_CLAN_IMAGE}/g,
    STEAM_CLAN_CDN
  );

  // 2. Extraire les images au format BBCode : [img]URL[/img]
  const bbcodeMatch = processedContent.match(/\[img\](https?:\/\/[^\]]+)\[\/img\]/i);
  if (bbcodeMatch && bbcodeMatch[1]) {
    return bbcodeMatch[1].trim();
  }

  // 3. Extraire les images au format HTML : <img src="URL">
  const htmlMatch = processedContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (htmlMatch && htmlMatch[1]) {
    return htmlMatch[1].trim();
  }

  // 4. Chercher les URLs directes d'images (Steam CDN, Akamai, etc.)
  // Formats supportés : jpg, jpeg, png, gif, webp
  const urlMatch = processedContent.match(/(https?:\/\/[^\s<>"]+\.(jpg|jpeg|png|gif|webp))/i);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].trim();
  }

  // Aucune image trouvée
  return null;
}

/**
 * Extrait toutes les images du contenu d'une news
 * Utile pour une future fonctionnalité de galerie
 *
 * @param {string} contents - Contenu brut de la news
 * @returns {string[]} Tableau des URLs d'images trouvées
 */
function extractAllImages(contents) {
  if (!contents || typeof contents !== 'string') {
    return [];
  }

  const images = [];

  // Remplacer les placeholders
  const processedContent = contents.replace(
    /{STEAM_CLAN_IMAGE}/g,
    STEAM_CLAN_CDN
  );

  // Extraire toutes les images BBCode
  const bbcodeMatches = processedContent.matchAll(/\[img\](https?:\/\/[^\]]+)\[\/img\]/gi);
  for (const match of bbcodeMatches) {
    if (match[1]) {
      images.push(match[1].trim());
    }
  }

  // Extraire toutes les images HTML
  const htmlMatches = processedContent.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
  for (const match of htmlMatches) {
    if (match[1] && !images.includes(match[1].trim())) {
      images.push(match[1].trim());
    }
  }

  // Extraire toutes les URLs directes
  const urlMatches = processedContent.matchAll(/(https?:\/\/[^\s<>"]+\.(jpg|jpeg|png|gif|webp))/gi);
  for (const match of urlMatches) {
    if (match[1] && !images.includes(match[1].trim())) {
      images.push(match[1].trim());
    }
  }

  return images;
}

module.exports = {
  getGameLogoUrl,
  extractFirstImage,
  extractAllImages,
};
