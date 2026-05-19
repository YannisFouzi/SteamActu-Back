const mongoose = require('mongoose');

const User = require('../../../src/models/User');
const { buildUser, createUser, nextSteamId } = require('../../helpers/factories');

describe('Model User', () => {
  describe('validation', () => {
    it('exige steamId', async () => {
      const user = new User({});
      await expect(user.validate()).rejects.toThrow(/steamId/);
    });

    it('crée un user avec les defaults attendus', async () => {
      const user = await createUser();
      expect(user.language).toBe('fr');
      expect(user.lastChecked).toBeNull();
      expect(user.followedGames).toEqual([]);
      expect(user.recentActiveGames).toEqual([]);
      expect(user.newsFavorites).toEqual([]);
      expect(user.lastNewsFeedSeenAt).toBeNull();
      expect(user.gamesVersion).toBeNull();
      expect(user.wishlistVersion).toBeNull();
    });

    it('applique les defaults sur notificationSettings', async () => {
      const user = await createUser();
      expect(user.notificationSettings.newsNotifications).toBe(false);
      expect(user.notificationSettings.followPromptNotifications).toBe(false);
      expect(user.notificationSettings.libraryFollowMode).toBe('off');
      expect(user.notificationSettings.wishlistFollowMode).toBe('off');
      expect(user.notificationSettings.confirmUnfollowGames).toBe(true);
      expect(user.notificationSettings.fcmTokens).toEqual([]);
    });

    it('rejette une langue hors enum', async () => {
      const user = new User(buildUser({ language: 'jp' }));
      await expect(user.validate()).rejects.toThrow(/language/);
    });

    it.each(['off', 'auto', 'prompt'])(
      'accepte libraryFollowMode "%s"',
      async (mode) => {
        const user = new User(
          buildUser({
            notificationSettings: { libraryFollowMode: mode },
          }),
        );
        await expect(user.validate()).resolves.toBeUndefined();
      },
    );

    it('rejette libraryFollowMode hors enum', async () => {
      const user = new User(
        buildUser({
          notificationSettings: { libraryFollowMode: 'maybe' },
        }),
      );
      await expect(user.validate()).rejects.toThrow(/libraryFollowMode/);
    });

    it('rejette wishlistFollowMode hors enum', async () => {
      const user = new User(
        buildUser({
          notificationSettings: { wishlistFollowMode: 'maybe' },
        }),
      );
      await expect(user.validate()).rejects.toThrow(/wishlistFollowMode/);
    });

    it('refuse plus de 500 jeux suivis', async () => {
      const tooMany = Array.from({ length: 501 }, (_, i) => ({
        appId: String(i),
        followedAt: new Date(),
      }));
      const user = new User(buildUser({ followedGames: tooMany }));
      await expect(user.validate()).rejects.toThrow(/500/);
    });

    it('accepte exactement 500 jeux suivis', async () => {
      const exactly = Array.from({ length: 500 }, (_, i) => ({
        appId: String(i),
        followedAt: new Date(),
      }));
      const user = new User(buildUser({ followedGames: exactly }));
      await expect(user.validate()).resolves.toBeUndefined();
    });

    it('refuse plus de 200 jeux dans recentActiveGames', async () => {
      const tooMany = Array.from({ length: 201 }, (_, i) => ({
        appId: String(i),
        name: `Game ${i}`,
      }));
      const user = new User(buildUser({ recentActiveGames: tooMany }));
      await expect(user.validate()).rejects.toThrow(/200/);
    });

    it('exige token et platform pour un fcmToken', async () => {
      const user = new User(
        buildUser({
          notificationSettings: {
            fcmTokens: [{ token: '', platform: 'android' }],
          },
        }),
      );
      await expect(user.validate()).rejects.toThrow();
    });

    it('rejette une platform hors enum', async () => {
      const user = new User(
        buildUser({
          notificationSettings: {
            fcmTokens: [{ token: 'tok', platform: 'symbian' }],
          },
        }),
      );
      await expect(user.validate()).rejects.toThrow(/platform/);
    });
  });

  describe('contraintes Mongo', () => {
    it('steamId est unique', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId });
      await expect(createUser({ steamId })).rejects.toThrow();
    });

    it('possède un index unique sur steamId', () => {
      const indexes = User.schema.indexes();
      const hasUnique = User.schema.path('steamId').options.unique === true;
      expect(hasUnique || indexes.some(([k, opts]) => k.steamId && opts?.unique)).toBe(
        true,
      );
    });
  });

  describe('toJSON()', () => {
    it('sérialise followedGames en array de strings (appIds)', async () => {
      const user = await createUser({
        followedGames: ['730', '570', '440'],
      });
      const json = user.toJSON();
      expect(json.followedGames).toEqual(['730', '570', '440']);
    });

    it('survit aux entrées legacy strings dans followedGames', async () => {
      const user = await createUser();
      const direct = user.toObject();
      direct.followedGames = ['730', { appId: '570' }, null];
      const transformed = User.schema.options.toJSON.transform(user, direct);
      expect(transformed.followedGames).toEqual(['730', '570']);
    });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await User.deleteMany({});
    }
  });
});
