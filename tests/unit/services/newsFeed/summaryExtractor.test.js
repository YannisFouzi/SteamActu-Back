const {
  extractSummary,
} = require('../../../../src/services/newsFeed/summaryExtractor');

describe('services/newsFeed/summaryExtractor — extractSummary', () => {
  it('renvoie "" pour entrée vide/non-string', () => {
    expect(extractSummary('')).toBe('');
    expect(extractSummary(null)).toBe('');
    expect(extractSummary(undefined)).toBe('');
    expect(extractSummary(42)).toBe('');
  });

  it('retire le bloc image BBCode et renvoie la 1re phrase', () => {
    const contents =
      '[img]https://cdn/x.jpg[/img]Get ready to command Zero Company across PC. Second sentence here.';
    expect(extractSummary(contents)).toBe(
      'Get ready to command Zero Company across PC.',
    );
  });

  it('nettoie les tags BBCode en gardant le texte interne', () => {
    expect(extractSummary('[b]Hello[/b] [url=https://x]world[/url]!')).toBe(
      'Hello world!',
    );
  });

  it('nettoie les tags HTML et les entités', () => {
    expect(extractSummary('<p>Tom &amp; Jerry arrive.</p>')).toBe(
      'Tom & Jerry arrive.',
    );
  });

  it('retire les placeholders {STEAM_CLAN_IMAGE}', () => {
    expect(extractSummary('{STEAM_CLAN_IMAGE}/1/a.png Patch 1.2 is live.')).toBe(
      'Patch 1.2 is live.',
    );
  });

  it('tronque avec ellipsis si pas de fin de phrase et trop long', () => {
    const long = 'a'.repeat(300);
    const out = extractSummary(long, 50);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBeLessThanOrEqual(51);
  });
});
