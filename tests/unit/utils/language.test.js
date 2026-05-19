const {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  isSupportedAppLanguage,
  normalizeAppLanguage,
  toSteamNewsLanguage,
  toSteamStoreLanguage,
} = require('../../../src/utils/language');

describe('utils/language', () => {
  describe('constantes', () => {
    it('expose les 6 langues supportées', () => {
      expect(SUPPORTED_LANGUAGES).toEqual(['fr', 'en', 'de', 'es', 'ru', 'zh']);
    });

    it('défaut = fr', () => {
      expect(DEFAULT_LANGUAGE).toBe('fr');
    });
  });

  describe('isSupportedAppLanguage()', () => {
    it.each(SUPPORTED_LANGUAGES)('accepte le code court "%s"', (code) => {
      expect(isSupportedAppLanguage(code)).toBe(true);
    });

    it('accepte les codes BCP47 (en-US, fr-FR, zh-Hans, etc.)', () => {
      expect(isSupportedAppLanguage('en-US')).toBe(true);
      expect(isSupportedAppLanguage('fr-FR')).toBe(true);
      expect(isSupportedAppLanguage('de-DE')).toBe(true);
      expect(isSupportedAppLanguage('es-MX')).toBe(true);
      expect(isSupportedAppLanguage('ru-RU')).toBe(true);
      expect(isSupportedAppLanguage('zh-Hans')).toBe(true);
      expect(isSupportedAppLanguage('zh-CN')).toBe(true);
    });

    it('est insensible à la casse', () => {
      expect(isSupportedAppLanguage('FR')).toBe(true);
      expect(isSupportedAppLanguage('En-Gb')).toBe(true);
      expect(isSupportedAppLanguage('  fr  ')).toBe(true);
    });

    it('rejette les langues non supportées', () => {
      expect(isSupportedAppLanguage('jp')).toBe(false);
      expect(isSupportedAppLanguage('it')).toBe(false);
      expect(isSupportedAppLanguage('pt-BR')).toBe(false);
    });

    it('rejette les valeurs non-string', () => {
      expect(isSupportedAppLanguage(null)).toBe(false);
      expect(isSupportedAppLanguage(undefined)).toBe(false);
      expect(isSupportedAppLanguage(123)).toBe(false);
      expect(isSupportedAppLanguage({})).toBe(false);
      expect(isSupportedAppLanguage([])).toBe(false);
    });
  });

  describe('normalizeAppLanguage()', () => {
    it('renvoie le code court pour un code court connu', () => {
      expect(normalizeAppLanguage('fr')).toBe('fr');
      expect(normalizeAppLanguage('en')).toBe('en');
      expect(normalizeAppLanguage('zh')).toBe('zh');
    });

    it('extrait le préfixe pour un BCP47', () => {
      expect(normalizeAppLanguage('en-US')).toBe('en');
      expect(normalizeAppLanguage('fr-FR')).toBe('fr');
      expect(normalizeAppLanguage('zh-Hans')).toBe('zh');
      expect(normalizeAppLanguage('zh-CN')).toBe('zh');
      expect(normalizeAppLanguage('ru-RU')).toBe('ru');
    });

    it('renvoie DEFAULT_LANGUAGE pour une langue non supportée', () => {
      expect(normalizeAppLanguage('jp')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeAppLanguage('pt-BR')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeAppLanguage('')).toBe(DEFAULT_LANGUAGE);
      expect(normalizeAppLanguage(null)).toBe(DEFAULT_LANGUAGE);
      expect(normalizeAppLanguage(undefined)).toBe(DEFAULT_LANGUAGE);
    });
  });

  describe('toSteamNewsLanguage()', () => {
    it('map vers les noms longs Steam (english, french, ...)', () => {
      expect(toSteamNewsLanguage('en')).toBe('english');
      expect(toSteamNewsLanguage('fr')).toBe('french');
      expect(toSteamNewsLanguage('de')).toBe('german');
      expect(toSteamNewsLanguage('es')).toBe('spanish');
      expect(toSteamNewsLanguage('ru')).toBe('russian');
      expect(toSteamNewsLanguage('zh')).toBe('schinese');
    });

    it('fallback "english" pour les langues inconnues (DEFAULT_LANGUAGE→french en fait)', () => {
      // DEFAULT_LANGUAGE='fr' → 'french'. Vérifions le vrai mapping :
      expect(toSteamNewsLanguage('jp')).toBe('french');
      expect(toSteamNewsLanguage(null)).toBe('french');
    });

    it('accepte les variantes BCP47', () => {
      expect(toSteamNewsLanguage('en-US')).toBe('english');
      expect(toSteamNewsLanguage('zh-Hans')).toBe('schinese');
    });
  });

  describe('toSteamStoreLanguage()', () => {
    it('partage le même mapping que toSteamNewsLanguage', () => {
      SUPPORTED_LANGUAGES.forEach((code) => {
        expect(toSteamStoreLanguage(code)).toBe(toSteamNewsLanguage(code));
      });
    });
  });
});
