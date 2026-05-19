const {
  extractFirstImage,
} = require('../../../../src/services/newsFeed/imageExtractor');

describe('services/newsFeed/imageExtractor', () => {
  describe('extractFirstImage()', () => {
    it('retourne null si input null/undefined/non-string/vide', () => {
      expect(extractFirstImage(null)).toBeNull();
      expect(extractFirstImage(undefined)).toBeNull();
      expect(extractFirstImage('')).toBeNull();
      expect(extractFirstImage(123)).toBeNull();
      expect(extractFirstImage({})).toBeNull();
    });

    it('extrait depuis BBCode [img]URL[/img]', () => {
      expect(
        extractFirstImage('[img]https://example.com/a.png[/img] suite'),
      ).toBe('https://example.com/a.png');
    });

    it('extrait depuis HTML <img src="URL">', () => {
      expect(
        extractFirstImage('<p><img src="https://example.com/b.jpg" alt="x"></p>'),
      ).toBe('https://example.com/b.jpg');
    });

    it('accepte les single quotes en HTML', () => {
      expect(
        extractFirstImage("<img src='https://example.com/c.jpg'>"),
      ).toBe('https://example.com/c.jpg');
    });

    it('résout le placeholder {STEAM_CLAN_IMAGE}', () => {
      const url = extractFirstImage('[img]{STEAM_CLAN_IMAGE}/123/abc.png[/img]');
      expect(url).toBe(
        'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans/123/abc.png',
      );
    });

    it('fallback URL directe d\'image (jpg/png/gif/webp)', () => {
      expect(extractFirstImage('texte https://x.com/img.jpg blabla')).toBe(
        'https://x.com/img.jpg',
      );
      expect(extractFirstImage('https://x.com/a.webp')).toBe('https://x.com/a.webp');
      expect(extractFirstImage('https://x.com/a.gif')).toBe('https://x.com/a.gif');
    });

    it('BBCode prioritaire sur HTML qui suit', () => {
      const html =
        '[img]https://bbcode.example/1.png[/img] avant <img src="https://html.example/1.png">';
      expect(extractFirstImage(html)).toBe('https://bbcode.example/1.png');
    });

    it('HTML prioritaire sur URL directe', () => {
      const html =
        '<img src="https://html.example/1.png"> et url https://direct.example/2.jpg';
      expect(extractFirstImage(html)).toBe('https://html.example/1.png');
    });

    it('retourne null si aucune image détectée', () => {
      expect(extractFirstImage('Juste du texte sans image.')).toBeNull();
      expect(extractFirstImage('Un lien https://example.com sans extension.')).toBeNull();
    });

    it('insensible à la casse pour les tags', () => {
      expect(extractFirstImage('[IMG]https://x.com/y.png[/IMG]')).toBe(
        'https://x.com/y.png',
      );
      expect(extractFirstImage('<IMG SRC="https://x.com/y.png">')).toBe(
        'https://x.com/y.png',
      );
    });
  });
});
