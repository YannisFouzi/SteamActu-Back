const {
  getFollowedAppIds,
  buildFollowedGamesEntry,
  getMutedAppIds,
  hasFollowedGame,
} = require('../../../src/utils/followedGamesHelpers');

describe('utils/followedGamesHelpers', () => {
  describe('getFollowedAppIds()', () => {
    it('retourne [] quand user est null/undefined/sans followedGames', () => {
      expect(getFollowedAppIds(null)).toEqual([]);
      expect(getFollowedAppIds(undefined)).toEqual([]);
      expect(getFollowedAppIds({})).toEqual([]);
      expect(getFollowedAppIds({ followedGames: null })).toEqual([]);
      expect(getFollowedAppIds({ followedGames: 'not-an-array' })).toEqual([]);
    });

    it('extrait appId des entrées objet { appId, followedAt }', () => {
      const user = {
        followedGames: [
          { appId: '730', followedAt: new Date() },
          { appId: '570', followedAt: new Date() },
        ],
      };
      expect(getFollowedAppIds(user)).toEqual(['730', '570']);
    });

    it('accepte le format legacy (array de strings)', () => {
      const user = { followedGames: ['730', '570'] };
      expect(getFollowedAppIds(user)).toEqual(['730', '570']);
    });

    it('mixe les deux formats sans crash', () => {
      const user = {
        followedGames: [
          '730',
          { appId: '570', followedAt: new Date() },
          { appId: 440 },
        ],
      };
      expect(getFollowedAppIds(user)).toEqual(['730', '570', '440']);
    });

    it('filtre les entrées invalides (null, undefined, sans appId)', () => {
      const user = {
        followedGames: [
          null,
          undefined,
          {},
          { foo: 'bar' },
          { appId: '' },
          { appId: '730' },
        ],
      };
      expect(getFollowedAppIds(user)).toEqual(['730']);
    });

    it('convertit appId number en string', () => {
      const user = { followedGames: [{ appId: 730 }] };
      expect(getFollowedAppIds(user)).toEqual(['730']);
    });
  });

  describe('buildFollowedGamesEntry()', () => {
    it('construit { appId, followedAt, notifications: true } par défaut', () => {
      const entry = buildFollowedGamesEntry('730');
      expect(entry).toEqual({
        appId: '730',
        followedAt: expect.any(Date),
        notifications: true,
      });
    });

    it('notifications: false produit un suivi silencieux', () => {
      expect(buildFollowedGamesEntry('730', false).notifications).toBe(false);
    });

    it('toute valeur non-false de notifications est coercée à true', () => {
      expect(buildFollowedGamesEntry('730', undefined).notifications).toBe(true);
      expect(buildFollowedGamesEntry('730', null).notifications).toBe(true);
      expect(buildFollowedGamesEntry('730', 'false').notifications).toBe(true);
    });

    it('coerce appId number en string', () => {
      const entry = buildFollowedGamesEntry(730);
      expect(entry.appId).toBe('730');
    });

    it('followedAt est proche de now', () => {
      const before = Date.now();
      const entry = buildFollowedGamesEntry('730');
      const after = Date.now();
      expect(entry.followedAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(entry.followedAt.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('getMutedAppIds()', () => {
    it('retourne les appIds avec notifications === false uniquement', () => {
      const user = {
        followedGames: [
          { appId: '730', notifications: false },
          { appId: '570', notifications: true },
          { appId: '440' }, // legacy sans le champ → notifié
          '220', // legacy string → notifié
        ],
      };
      expect(getMutedAppIds(user)).toEqual(new Set(['730']));
    });

    it('retourne un Set vide pour user null/sans followedGames', () => {
      expect(getMutedAppIds(null)).toEqual(new Set());
      expect(getMutedAppIds({})).toEqual(new Set());
      expect(getMutedAppIds({ followedGames: 'oops' })).toEqual(new Set());
    });

    it('coerce appId number en string', () => {
      const user = { followedGames: [{ appId: 730, notifications: false }] };
      expect(getMutedAppIds(user)).toEqual(new Set(['730']));
    });
  });

  describe('hasFollowedGame()', () => {
    const user = {
      followedGames: [
        { appId: '730', followedAt: new Date() },
        { appId: '570', followedAt: new Date() },
      ],
    };

    it('renvoie true pour un appId suivi', () => {
      expect(hasFollowedGame(user, '730')).toBe(true);
      expect(hasFollowedGame(user, '570')).toBe(true);
    });

    it('renvoie false pour un appId non suivi', () => {
      expect(hasFollowedGame(user, '999')).toBe(false);
    });

    it('coerce appId number en string pour la comparaison', () => {
      expect(hasFollowedGame(user, 730)).toBe(true);
    });

    it('renvoie false si appId est falsy', () => {
      expect(hasFollowedGame(user, '')).toBe(false);
      expect(hasFollowedGame(user, null)).toBe(false);
      expect(hasFollowedGame(user, undefined)).toBe(false);
      expect(hasFollowedGame(user, 0)).toBe(false);
    });

    it('renvoie false pour user vide', () => {
      expect(hasFollowedGame(null, '730')).toBe(false);
      expect(hasFollowedGame({}, '730')).toBe(false);
    });
  });
});
