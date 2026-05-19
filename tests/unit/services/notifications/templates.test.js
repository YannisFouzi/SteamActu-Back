const {
  createNewsNotification,
  createAutoFollowNotification,
  createFollowPromptNotification,
  createGeneralNotification,
} = require('../../../../src/services/notifications/templates');

const LANGS = ['fr', 'en', 'de', 'es', 'ru', 'zh'];

describe('services/notifications/templates', () => {
  describe('createNewsNotification()', () => {
    const baseNews = {
      title: 'Patch 1.2',
      url: 'https://store.steampowered.com/news/1',
      gid: 'news-1',
    };

    it('utilise gameName comme title, fallback localisé sinon', () => {
      const withName = createNewsNotification('730', baseNews, 'CSGO');
      expect(withName.title).toBe('CSGO');

      const withoutName = createNewsNotification('730', baseNews, null, null, 'fr');
      expect(withoutName.title).toBe('Nouvelle actualite jeu');

      const en = createNewsNotification('730', baseNews, null, null, 'en');
      expect(en.title).toBe('New game update');
    });

    it('expose les champs data attendus', () => {
      const notif = createNewsNotification('730', baseNews, 'CSGO', '7656', 'fr');
      expect(notif.body).toBe('Patch 1.2');
      expect(notif.data).toMatchObject({
        type: 'news',
        url: 'https://store.steampowered.com/news/1',
        appId: '730',
        steamId: '7656',
        newsId: 'news-1',
        context: 'news',
        allowUnfollow: true,
      });
    });

    it('ajoute imageUrl uniquement si firstImageUrl présent', () => {
      const without = createNewsNotification('730', baseNews, 'CSGO');
      expect(without.data.imageUrl).toBeUndefined();

      const withImg = createNewsNotification(
        '730',
        { ...baseNews, firstImageUrl: 'https://img.example/1.jpg' },
        'CSGO',
      );
      expect(withImg.data.imageUrl).toBe('https://img.example/1.jpg');
    });

    it('ajoute gameLogoUrl uniquement si présent', () => {
      const withLogo = createNewsNotification(
        '730',
        { ...baseNews, gameLogoUrl: 'https://logo.example/1.jpg' },
        'CSGO',
      );
      expect(withLogo.data.gameLogoUrl).toBe('https://logo.example/1.jpg');
    });

    it('omet steamId si null/undefined', () => {
      const notif = createNewsNotification('730', baseNews, 'CSGO');
      expect(notif.data.steamId).toBeUndefined();
    });

    it('utilise le context fourni dans newsItem', () => {
      const notif = createNewsNotification(
        '730',
        { ...baseNews, context: 'patch_notes' },
        'CSGO',
      );
      expect(notif.data.context).toBe('patch_notes');
    });

    it('fallback français pour langue non supportée', () => {
      const notif = createNewsNotification('730', baseNews, null, null, 'jp');
      expect(notif.title).toBe('Nouvelle actualite jeu');
    });
  });

  describe('createAutoFollowNotification()', () => {
    it.each(LANGS)('génère un titre + body localisé pour "%s"', (lang) => {
      const notif = createAutoFollowNotification('730', 'CSGO', lang);
      expect(notif.title).toBeTruthy();
      expect(notif.body).toContain('CSGO');
      expect(notif.data).toEqual({
        type: 'auto_follow',
        appId: '730',
        allowUnfollow: false,
      });
    });
  });

  describe('createFollowPromptNotification()', () => {
    it.each([
      ['library', 'fr', 'votre bibliothèque Steam'],
      ['wishlist', 'fr', 'votre wishlist Steam'],
      ['family', 'fr', 'votre Steam Famille'],
      ['library', 'en', 'your Steam library'],
      ['wishlist', 'en', 'your Steam wishlist'],
      ['family', 'en', 'your Steam Family'],
    ])(
      'inclut le contextLabel correct pour source=%s lang=%s',
      (source, lang, expected) => {
        const notif = createFollowPromptNotification('730', 'CSGO', source, lang);
        expect(notif.title).toContain(expected);
      },
    );

    it('fallback vers library si source inconnue', () => {
      const notif = createFollowPromptNotification('730', 'CSGO', 'unknown', 'fr');
      expect(notif.title).toContain('votre bibliothèque Steam');
    });

    it('body localisé', () => {
      expect(createFollowPromptNotification('730', 'CSGO', 'library', 'fr').body).toBe(
        'Cliquez pour suivre ce jeu',
      );
      expect(createFollowPromptNotification('730', 'CSGO', 'library', 'en').body).toBe(
        'Tap to follow this game',
      );
    });

    it('expose data { type, appId, source, gameName, allowUnfollow }', () => {
      const notif = createFollowPromptNotification('730', 'CSGO', 'library', 'fr', '7656');
      expect(notif.data).toMatchObject({
        type: 'follow_prompt',
        appId: '730',
        source: 'library',
        gameName: 'CSGO',
        allowUnfollow: false,
        steamId: '7656',
      });
    });

    it('utilise "Jeu {appId}" si gameName absent (fr)', () => {
      const notif = createFollowPromptNotification('730', null, 'library', 'fr');
      expect(notif.title).toContain('Jeu 730');
    });

    it('utilise "Game {appId}" si gameName absent (en)', () => {
      const notif = createFollowPromptNotification('730', null, 'library', 'en');
      expect(notif.title).toContain('Game 730');
    });

    it('gameName par défaut à "" dans data', () => {
      const notif = createFollowPromptNotification('730', null, 'library', 'fr');
      expect(notif.data.gameName).toBe('');
    });
  });

  describe('createGeneralNotification()', () => {
    it('forwarde title/body et merge data avec type="general"', () => {
      const notif = createGeneralNotification('Hello', 'World', { foo: 'bar' });
      expect(notif).toEqual({
        title: 'Hello',
        body: 'World',
        data: { type: 'general', foo: 'bar' },
      });
    });

    it('data peut être omis', () => {
      const notif = createGeneralNotification('Hello', 'World');
      expect(notif.data).toEqual({ type: 'general' });
    });
  });
});
