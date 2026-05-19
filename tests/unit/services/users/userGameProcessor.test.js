const {
  sanitizeActiveGames,
} = require('../../../../src/services/users/userGameProcessor');

const DAY = 24 * 60 * 60 * 1000;

describe('services/users/userGameProcessor', () => {
  describe('sanitizeActiveGames()', () => {
    it('rejette les entrées sans appId', () => {
      const result = sanitizeActiveGames([
        { name: 'A', lastNewsDate: new Date() },
        { appId: '', name: 'B', lastNewsDate: new Date() },
        null,
      ]);
      expect(result).toEqual([]);
    });

    it('rejette les entrées sans timestamp valide', () => {
      const result = sanitizeActiveGames([
        { appId: '730', name: 'A' },
        { appId: '570', name: 'B', lastNewsDate: 'not a date' },
        { appId: '440', name: 'C', lastNewsDate: null },
      ]);
      expect(result).toEqual([]);
    });

    it('parse Date, number et string ISO', () => {
      const now = Date.now();
      const result = sanitizeActiveGames([
        { appId: '1', name: 'D', lastNewsDate: new Date(now - 2 * DAY) },
        { appId: '2', name: 'N', lastNewsDate: now - 3 * DAY },
        { appId: '3', name: 'S', lastNewsDate: new Date(now - DAY).toISOString() },
      ]);
      expect(result).toHaveLength(3);
      expect(result.map((g) => g.appId)).toEqual(['3', '1', '2']);
    });

    it('filtre les entrées hors fenêtre 7j (passé) ou +1h (futur)', () => {
      const now = Date.now();
      const result = sanitizeActiveGames([
        { appId: '1', name: 'old', lastNewsDate: new Date(now - 8 * DAY) },
        { appId: '2', name: 'far_future', lastNewsDate: new Date(now + 2 * 60 * 60 * 1000) },
        { appId: '3', name: 'ok', lastNewsDate: new Date(now - DAY) },
      ]);
      expect(result.map((g) => g.appId)).toEqual(['3']);
    });

    it('trie par date desc', () => {
      const now = Date.now();
      const result = sanitizeActiveGames([
        { appId: 'a', name: 'A', lastNewsDate: now - 5 * DAY },
        { appId: 'b', name: 'B', lastNewsDate: now - DAY },
        { appId: 'c', name: 'C', lastNewsDate: now - 3 * DAY },
      ]);
      expect(result.map((g) => g.appId)).toEqual(['b', 'c', 'a']);
    });

    it('cap à 200 entrées', () => {
      const now = Date.now();
      const games = Array.from({ length: 300 }, (_, i) => ({
        appId: String(i),
        name: `G${i}`,
        lastNewsDate: now - (i % 5) * 60 * 1000,
      }));
      const result = sanitizeActiveGames(games);
      expect(result).toHaveLength(200);
    });

    it('default name "Jeu {appId}" si name absent', () => {
      const result = sanitizeActiveGames([
        { appId: '730', lastNewsDate: new Date() },
      ]);
      expect(result[0].name).toBe('Jeu 730');
    });

    it('coerce appId en string', () => {
      const result = sanitizeActiveGames([
        { appId: 730, name: 'X', lastNewsDate: new Date() },
      ]);
      expect(result[0].appId).toBe('730');
    });
  });
});
