/**
 * Dérive un court extrait texte (≈ première phrase) à partir du `contents` brut
 * d'une news Steam (BBCode + HTML). Steam n'expose PAS de champ résumé via
 * ISteamNews/GetNewsForApp ; cet extrait est donc construit à partir du corps.
 */

const DEFAULT_MAX_LENGTH = 200;

/**
 * @param {string} contents - Contenu brut de la news (HTML/BBCode)
 * @param {number} [maxLength=200] - Longueur max de l'extrait
 * @returns {string} Extrait nettoyé (1re phrase, sinon début tronqué), ou ''
 */
function extractSummary(contents, maxLength = DEFAULT_MAX_LENGTH) {
  if (!contents || typeof contents !== 'string') {
    return '';
  }

  const text = contents
    // Blocs média BBCode (avec leur contenu) : images, vidéos, youtube
    .replace(/\[img\][^[]*\[\/img\]/gi, ' ')
    .replace(/\[previewyoutube[^\]]*\][^[]*\[\/previewyoutube\]/gi, ' ')
    .replace(/\[video[^\]]*\][^[]*\[\/video\]/gi, ' ')
    // Placeholders image du clan résiduels (+ leur chemin attaché)
    .replace(/{STEAM_CLAN_IMAGE}\S*/g, ' ')
    // Tags BBCode restants → on garde le texte interne ([b]x[/b] -> x)
    .replace(/\[\/?[a-z*][^\]]*\]/gi, ' ')
    // Tags HTML
    .replace(/<[^>]+>/g, ' ')
    // Entités HTML courantes
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    // URLs média nues résiduelles
    .replace(/https?:\/\/\S+\.(?:jpg|jpeg|png|gif|webp|mp4|webm)\b/gi, ' ')
    // Espaces compactés
    .replace(/\s+/g, ' ')
    // Pas d'espace avant la ponctuation (issu des tags retirés)
    .replace(/\s+([.,;:!?…])/g, '$1')
    .trim();

  if (!text) {
    return '';
  }

  // Première phrase (jusqu'à . ! ? suivi d'un espace ou de la fin), sinon tout.
  const sentenceMatch = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  let summary = sentenceMatch ? sentenceMatch[0].trim() : text;

  if (summary.length > maxLength) {
    summary =
      summary.slice(0, maxLength).replace(/[\s.,;:!?\-–—]+$/, '').trim() + '…';
  }

  return summary;
}

module.exports = { extractSummary };
