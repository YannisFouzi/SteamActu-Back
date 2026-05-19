const {
  createStats,
  updateStats,
} = require('../../../../src/services/gamesSync/statsManager');

describe('services/gamesSync/statsManager', () => {
  describe('createStats()', () => {
    it('renvoie les compteurs à 0 par défaut', () => {
      expect(createStats()).toEqual({
        totalUsers: 0,
        usersProcessed: 0,
        usersWithNewGames: 0,
        totalNewGames: 0,
        errors: 0,
      });
    });

    it('merge les options additionnelles', () => {
      expect(createStats({ groupIndex: 3, totalGroups: 12 })).toMatchObject({
        groupIndex: 3,
        totalGroups: 12,
        totalUsers: 0,
      });
    });
  });

  describe('updateStats()', () => {
    it('incrémente usersProcessed', () => {
      const stats = createStats();
      updateStats(stats, { updatedGames: [] });
      expect(stats.usersProcessed).toBe(1);
    });

    it('incrémente usersWithNewGames + totalNewGames quand updatedGames non vide', () => {
      const stats = createStats();
      updateStats(stats, { updatedGames: [{ appId: '1' }, { appId: '2' }] });
      expect(stats.usersWithNewGames).toBe(1);
      expect(stats.totalNewGames).toBe(2);
    });

    it('n\'incrémente PAS usersWithNewGames si updatedGames vide ou absent', () => {
      const stats = createStats();
      updateStats(stats, { updatedGames: [] });
      updateStats(stats, {});
      expect(stats.usersWithNewGames).toBe(0);
      expect(stats.totalNewGames).toBe(0);
    });

    it('incrémente errors si result.error', () => {
      const stats = createStats();
      updateStats(stats, { error: 'boom' });
      expect(stats.errors).toBe(1);
    });
  });
});
