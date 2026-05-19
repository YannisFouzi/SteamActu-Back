const {
  formatGame,
  getLastUpdateTimestamp,
} = require('../../../../src/services/steam/gameFormatter');

describe('services/steam/gameFormatter', () => {
  describe('formatGame()', () => {
    const baseGame = {
      appid: 730,
      name: 'CS:GO',
      img_icon_url: 'icon-hash',
      img_logo_url: 'logo-hash',
      header_image: 'https://example.com/header.jpg',
      playtime_forever: 1200,
      playtime_2weeks: 60,
      rtime_last_played: 1_700_000_000,
      hasPlaytimeData: true,
    };

    it('expose appid (lowercase) + appId (camelCase) en string', () => {
      const formatted = formatGame(baseGame);
      expect(formatted.appid).toBe('730');
      expect(formatted.appId).toBe('730');
    });

    it('utilise header_image fourni quand non vide et != "none"', () => {
      const formatted = formatGame(baseGame);
      expect(formatted.header_image).toBe('https://example.com/header.jpg');
    });

    it('génère un header_image fallback si header absent ou "none"', () => {
      const fallback = formatGame({ ...baseGame, header_image: 'none' });
      expect(fallback.header_image).toBe(
        'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/730/header.jpg',
      );
      const missing = formatGame({ ...baseGame, header_image: undefined });
      expect(missing.header_image).toContain('/apps/730/header.jpg');
    });

    it('construit iconUrl et logoUrl à partir des hashes', () => {
      const formatted = formatGame(baseGame);
      expect(formatted.iconUrl).toBe(
        'http://media.steampowered.com/steamcommunity/public/images/apps/730/icon-hash.jpg',
      );
      expect(formatted.logoUrl).toBe(
        'http://media.steampowered.com/steamcommunity/public/images/apps/730/logo-hash.jpg',
      );
    });

    it('iconUrl/logoUrl à null si hashes absents', () => {
      const formatted = formatGame({
        ...baseGame,
        img_icon_url: '',
        img_logo_url: '',
      });
      expect(formatted.iconUrl).toBeNull();
      expect(formatted.logoUrl).toBeNull();
    });

    it('renvoie playtime { forever, recent } avec defaults 0', () => {
      const formatted = formatGame({
        ...baseGame,
        playtime_forever: undefined,
        playtime_2weeks: undefined,
      });
      expect(formatted.playtime).toEqual({ forever: 0, recent: 0 });
    });

    it('rtime_last_played : conserve si entier positif, sinon null', () => {
      expect(formatGame(baseGame).rtime_last_played).toBe(1_700_000_000);
      expect(
        formatGame({ ...baseGame, rtime_last_played: 0 }).rtime_last_played,
      ).toBeNull();
      expect(
        formatGame({ ...baseGame, rtime_last_played: -5 }).rtime_last_played,
      ).toBeNull();
      expect(
        formatGame({ ...baseGame, rtime_last_played: 'abc' }).rtime_last_played,
      ).toBeNull();
    });

    it('isFamilyShared et hasPlaytimeData coerce en boolean', () => {
      const f = formatGame({ ...baseGame, isFamilyShared: 1, hasPlaytimeData: 0 });
      expect(f.isFamilyShared).toBe(true);
      expect(f.hasPlaytimeData).toBe(false);
    });

    it('lastUpdateTimestamp est repris du paramètre', () => {
      expect(formatGame(baseGame, 12345).lastUpdateTimestamp).toBe(12345);
      expect(formatGame(baseGame).lastUpdateTimestamp).toBe(0);
    });
  });

  describe('getLastUpdateTimestamp()', () => {
    afterEach(() => {
      delete global.gameNewsCache;
    });

    it('lit depuis le cache global en priorité', () => {
      global.gameNewsCache = { 730: { timestamp: 42 } };
      expect(getLastUpdateTimestamp('730')).toBe(42);
    });

    it('fallback sur user.followedGames si pas dans le cache', () => {
      const user = {
        followedGames: [
          { appId: '730', lastUpdateTimestamp: 99 },
          { appId: '570', lastUpdateTimestamp: 11 },
        ],
      };
      expect(getLastUpdateTimestamp('570', user)).toBe(11);
    });

    it('retourne 0 si rien trouvé', () => {
      expect(getLastUpdateTimestamp('999')).toBe(0);
      expect(getLastUpdateTimestamp('999', { followedGames: [] })).toBe(0);
      expect(getLastUpdateTimestamp('999', null)).toBe(0);
    });

    it('cache global a priorité sur user', () => {
      global.gameNewsCache = { 730: { timestamp: 100 } };
      const user = { followedGames: [{ appId: '730', lastUpdateTimestamp: 1 }] };
      expect(getLastUpdateTimestamp('730', user)).toBe(100);
    });
  });
});
