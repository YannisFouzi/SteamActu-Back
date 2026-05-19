const {
  getUserAndFollowedGames,
  optimizeCandidates,
} = require('../../../../src/services/newsFeed/newsFeedUserManager');
const { createUser, nextSteamId } = require('../../../helpers/factories');

describe('services/newsFeed/newsFeedUserManager', () => {
  describe('getUserAndFollowedGames()', () => {
    it('retourne { user: null, followedSet: Set() } si steamId absent', async () => {
      const result = await getUserAndFollowedGames(null);
      expect(result.user).toBeNull();
      expect(result.followedSet).toBeInstanceOf(Set);
      expect(result.followedSet.size).toBe(0);
    });

    it('charge le user et expose les appIds suivis dans un Set', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        followedGames: ['730', '570', '440'],
      });

      const { user, followedSet } = await getUserAndFollowedGames(steamId);
      expect(user).toBeTruthy();
      expect(user.steamId).toBe(steamId);
      expect(followedSet).toBeInstanceOf(Set);
      expect([...followedSet].sort()).toEqual(['440', '570', '730']);
    });

    it('renvoie un Set vide si user inexistant', async () => {
      const { user, followedSet } = await getUserAndFollowedGames('99999999999999999');
      expect(user).toBeNull();
      expect(followedSet.size).toBe(0);
    });
  });

  describe('optimizeCandidates()', () => {
    it('trie par lastNewsDate desc selon user.recentActiveGames', () => {
      const candidates = new Map([
        ['730', { appId: '730', name: 'A' }],
        ['570', { appId: '570', name: 'B' }],
        ['440', { appId: '440', name: 'C' }],
      ]);
      const user = {
        recentActiveGames: [
          { appId: '730', lastNewsDate: new Date('2026-05-01') },
          { appId: '440', lastNewsDate: new Date('2026-05-10') },
          { appId: '570', lastNewsDate: new Date('2026-04-15') },
        ],
      };

      const sorted = optimizeCandidates(candidates.values(), user, 10, 5);
      expect(sorted.map((g) => g.appId)).toEqual(['440', '730', '570']);
    });

    it('cap à max(safeLimit*2, safePerGameLimit*10, 100)', () => {
      const candidates = Array.from({ length: 300 }, (_, i) => ({
        appId: String(i),
        name: `G${i}`,
      }));
      const sorted = optimizeCandidates(candidates, null, 10, 3);
      // max(20, 30, 100) = 100
      expect(sorted).toHaveLength(100);
    });

    it('gère user null sans crash', () => {
      const candidates = [{ appId: '1', name: 'A' }];
      expect(optimizeCandidates(candidates, null, 10, 5)).toHaveLength(1);
    });

    it('gère recentActiveGames absent ou vide', () => {
      const candidates = [
        { appId: '1', name: 'A' },
        { appId: '2', name: 'B' },
      ];
      const sorted = optimizeCandidates(candidates, { recentActiveGames: [] }, 10, 5);
      expect(sorted).toHaveLength(2);
    });
  });
});
