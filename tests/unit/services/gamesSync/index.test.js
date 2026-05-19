const userProcessorMock = { syncUserGames: jest.fn() };

jest.doMock(
  '../../../../src/services/gamesSync/userProcessor',
  () => userProcessorMock,
);

jest.doMock('../../../../src/services/steam/visibilityCheck', () => ({
  checkGamesVisibility: jest.fn().mockResolvedValue(true),
}));

const {
  syncAllUsersGames,
  syncUserGroupByIndex,
} = require('../../../../src/services/gamesSync');
const {
  checkGamesVisibility,
} = require('../../../../src/services/steam/visibilityCheck');
const { createUser } = require('../../../helpers/factories');

describe('services/gamesSync/index', () => {
  beforeEach(() => {
    userProcessorMock.syncUserGames.mockReset();
    checkGamesVisibility.mockReset();
    checkGamesVisibility.mockResolvedValue(true);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('syncAllUsersGames()', () => {
    it('itère tous les users, agrège stats', async () => {
      await Promise.all([createUser(), createUser(), createUser()]);
      userProcessorMock.syncUserGames.mockResolvedValue({
        updatedGames: [{ appId: '1' }],
        error: null,
      });

      const stats = await syncAllUsersGames();
      expect(stats.totalUsers).toBe(3);
      expect(stats.usersProcessed).toBe(3);
      expect(stats.usersWithNewGames).toBe(3);
      expect(stats.totalNewGames).toBe(3);
      expect(stats.errors).toBe(0);
    });

    it('skip les profils privés (checkGamesVisibility=false)', async () => {
      await createUser();
      checkGamesVisibility.mockResolvedValueOnce(false);
      userProcessorMock.syncUserGames.mockResolvedValue({ updatedGames: [] });

      const stats = await syncAllUsersGames();
      expect(stats.usersProcessed).toBe(0);
      expect(userProcessorMock.syncUserGames).not.toHaveBeenCalled();
    });

    it('compte les erreurs sans bloquer le reste', async () => {
      await createUser();
      await createUser();
      userProcessorMock.syncUserGames
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ updatedGames: [] });

      const stats = await syncAllUsersGames();
      expect(stats.errors).toBe(1);
      expect(stats.usersProcessed).toBe(1);
    });
  });

  describe('syncUserGroupByIndex()', () => {
    it('rejette un groupIndex invalide', async () => {
      const stats = await syncUserGroupByIndex(15, 12);
      expect(stats.errors).toBe(1);
      expect(stats.usersProcessed).toBe(0);
    });

    it('ne traite que les users du bucket sélectionné', async () => {
      // 5 users → bucket déterministe via stableHash
      const users = await Promise.all(
        Array.from({ length: 5 }, () => createUser()),
      );
      userProcessorMock.syncUserGames.mockResolvedValue({ updatedGames: [] });

      const stats = await syncUserGroupByIndex(0, 12);

      // On vérifie que la somme sur 12 buckets équivaut au total
      let totalProcessedAcrossBuckets = stats.usersProcessed;
      for (let g = 1; g < 12; g += 1) {
        // eslint-disable-next-line no-await-in-loop
        const s = await syncUserGroupByIndex(g, 12);
        totalProcessedAcrossBuckets += s.usersProcessed;
      }
      expect(totalProcessedAcrossBuckets).toBe(users.length);
    });

    it('skipped=true si bucket vide (users existants mais aucun dans ce bucket)', async () => {
      const { userBucket } = require('../../../../src/utils/userBucket');
      const user = await createUser();
      const userBucketId = userBucket(user, 12);
      const emptyBucket = (userBucketId + 1) % 12;

      const stats = await syncUserGroupByIndex(emptyBucket, 12);
      expect(stats.skipped).toBe(true);
      expect(stats.usersInGroup).toBe(0);
    });
  });
});
