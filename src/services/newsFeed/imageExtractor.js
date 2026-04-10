/**
 * Service d'extraction d'images pour les news Steam
 * Gère la génération des URLs de logos de jeux et l'extraction des images depuis le contenu des news
 */

const STEAM_CLAN_CDN = 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans';

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

module.exports = {
  extractFirstImage,
};
