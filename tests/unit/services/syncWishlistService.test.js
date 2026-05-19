const steamServiceMock = {
  getUserWishlist: jest.fn(),
};

jest.doMock('../../../src/services/steamService', () => steamServiceMock);

jest.doMock('../../../src/services/steam/apiClient', () => ({
  fetchGameDetails: jest.fn(),
}));

jest.doMock('../../../src/services/users/subscriptionManager', () => ({
  addUserToGameSubscription: jest.fn(),
}));

jest.doMock(
  '../../../src/services/notifications/notificationService',
  () => ({ sendFollowPromptNotifications: jest.fn() }),
);

jest.doMock('../../../src/services/steamGridDbService', () => ({
  getGameImage: jest.fn().mockResolvedValue(null),
}));

const {
  syncUserWishlist,
  syncWishlistsByGroup,
} = require('../../../src/services/syncWishlistService');
const {
  addUserToGameSubscription,
} = require('../../../src/services/users/subscriptionManager');
const {
  sendFollowPromptNotifications,
} = require('../../../src/services/notifications/notificationService');
const {
  fetchGameDetails,
} = require('../../../src/services/steam/apiClient');
const User = require('../../../src/models/User');
const Wishlist = require('../../../src/models/Wishlist');
const {
  createUser,
  createWishlist,
  nextSteamId,
} = require('../../helpers/factories');

describe('services/syncWishlistService', () => {
  beforeEach(() => {
    steamServiceMock.getUserWishlist.mockReset();
    addUserToGameSubscription.mockReset();
    sendFollowPromptNotifications.mockReset();
    fetchGameDetails.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('syncUserWishlist()', () => {
    it('renvoie { success:false } si user inexistant', async () => {
      const result = await syncUserWishlist('99999999999999999');
      expect(result).toEqual({ success: false, error: 'Utilisateur non trouvé' });
    });

    it('renvoie { success:false } si Steam API throw', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      steamServiceMock.getUserWishlist.mockRejectedValueOnce(new Error('429'));
      const result = await syncUserWishlist(steamId);
      expect(result.success).toBe(false);
      expect(result.error).toBe('429');
    });

    it('wishlist vide → reset user.wishlist et bump wishlistVersion', async () => {
      const steamId = nextSteamId();
      const user = await createUser({ steamId });
      steamServiceMock.getUserWishlist.mockResolvedValueOnce([]);

      const result = await syncUserWishlist(steamId);
      expect(result).toEqual({ success: true, newGames: 0, autoFollowed: 0 });

      const reloaded = await User.findById(user._id).lean();
      expect(reloaded.wishlist.games).toEqual([]);
      expect(reloaded.wishlistVersion).toBeInstanceOf(Date);
    });

    it('cache-hit : utilise Wishlist BDD pour les jeux déjà connus, pas d\'appel Steam Store', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      await createWishlist({
        appId: '730',
        name: 'CSGO (cached)',
        header_image: 'https://cache/730.jpg',
      });

      steamServiceMock.getUserWishlist.mockResolvedValueOnce([
        { appid: 730, date_added: 1700000000, priority: 0 },
      ]);

      const result = await syncUserWishlist(steamId);
      expect(result.success).toBe(true);
      expect(fetchGameDetails).not.toHaveBeenCalled();
    });

    it('jeu inconnu en BDD → fetchGameDetails + insert dans Wishlist', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });

      steamServiceMock.getUserWishlist.mockResolvedValueOnce([
        { appid: 12345, date_added: 1700000000, priority: 0 },
      ]);
      fetchGameDetails.mockResolvedValueOnce({
        name: 'New Game',
        capsule_image: 'cap',
        header_image: 'hdr',
      });

      await syncUserWishlist(steamId);

      expect(fetchGameDetails).toHaveBeenCalledWith(12345);
      const doc = await Wishlist.findOne({ appId: '12345' }).lean();
      expect(doc).toMatchObject({ appId: '12345', name: 'New Game' });
    });

    it('wishlistFollowMode = auto → suit les nouveaux + appelle addUserToGameSubscription', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        notificationSettings: { wishlistFollowMode: 'auto' },
      });
      await createWishlist({ appId: '730', name: 'CSGO' });

      steamServiceMock.getUserWishlist.mockResolvedValueOnce([
        { appid: 730, date_added: 1, priority: 0 },
      ]);
      addUserToGameSubscription.mockResolvedValue();

      const result = await syncUserWishlist(steamId);
      expect(result.autoFollowed).toBe(1);
      expect(addUserToGameSubscription).toHaveBeenCalledWith(
        '730',
        steamId,
        'CSGO',
        expect.any(String),
      );

      const user = await User.findOne({ steamId }).lean();
      expect(user.followedGames.map((f) => f.appId)).toEqual(['730']);
    });

    it('wishlistFollowMode = prompt → followPrompts avec source="wishlist", pas d\'ajout direct', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        notificationSettings: { wishlistFollowMode: 'prompt' },
      });
      await createWishlist({ appId: '730', name: 'CSGO' });

      steamServiceMock.getUserWishlist.mockResolvedValueOnce([
        { appid: 730, date_added: 1, priority: 0 },
      ]);
      sendFollowPromptNotifications.mockResolvedValue(1);

      const result = await syncUserWishlist(steamId);
      expect(result.autoFollowed).toBe(0);
      expect(result.followPrompts).toHaveLength(1);
      expect(result.followPrompts[0]).toMatchObject({
        appId: '730',
        source: 'wishlist',
      });
      expect(addUserToGameSubscription).not.toHaveBeenCalled();
      expect(sendFollowPromptNotifications).toHaveBeenCalledWith(
        steamId,
        result.followPrompts,
      );
    });

    it('wishlistFollowMode = off → pas de follow ni prompt même pour nouveaux jeux', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        notificationSettings: { wishlistFollowMode: 'off' },
      });
      await createWishlist({ appId: '730', name: 'CSGO' });

      steamServiceMock.getUserWishlist.mockResolvedValueOnce([
        { appid: 730, date_added: 1, priority: 0 },
      ]);

      const result = await syncUserWishlist(steamId);
      expect(result.newGames).toBe(1);
      expect(result.autoFollowed).toBe(0);
      expect(addUserToGameSubscription).not.toHaveBeenCalled();
      expect(sendFollowPromptNotifications).not.toHaveBeenCalled();
    });

    it('skip auto-follow pour les jeux déjà suivis', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        followedGames: ['730'],
        notificationSettings: { wishlistFollowMode: 'auto' },
      });
      await createWishlist({ appId: '730', name: 'CSGO' });

      steamServiceMock.getUserWishlist.mockResolvedValueOnce([
        { appid: 730, date_added: 1, priority: 0 },
      ]);

      const result = await syncUserWishlist(steamId);
      expect(result.autoFollowed).toBe(0);
      expect(addUserToGameSubscription).not.toHaveBeenCalled();
    });

    it('utilise wishlistData fourni au lieu d\'appeler Steam', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      await createWishlist({ appId: '730', name: 'CSGO' });

      await syncUserWishlist(steamId, [
        { appid: 730, date_added: 1, priority: 0 },
      ]);

      expect(steamServiceMock.getUserWishlist).not.toHaveBeenCalled();
    });
  });

  describe('syncWishlistsByGroup()', () => {
    it('rejette des paramètres invalides (groupIndex hors bornes)', async () => {
      await expect(syncWishlistsByGroup(99, 12)).rejects.toThrow();
      await expect(syncWishlistsByGroup(-1, 12)).rejects.toThrow();
      await expect(syncWishlistsByGroup('abc', 12)).rejects.toThrow();
    });

    it('ne traite que les users du bucket', async () => {
      await Promise.all([createUser(), createUser(), createUser()]);
      steamServiceMock.getUserWishlist.mockResolvedValue([]);

      let total = 0;
      for (let g = 0; g < 12; g += 1) {
        // eslint-disable-next-line no-await-in-loop
        const s = await syncWishlistsByGroup(g, 12);
        total += s.usersInGroup;
      }
      expect(total).toBe(3);
    });
  });
});
