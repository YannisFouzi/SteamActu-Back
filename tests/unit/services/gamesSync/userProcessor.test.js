const steamServiceMock = {
  getUserGames: jest.fn(),
  getRecentlyPlayedGames: jest.fn(),
};

jest.doMock('../../../../src/services/steamService', () => steamServiceMock);

jest.doMock('../../../../src/services/users/subscriptionManager', () => ({
  addUserToGameSubscription: jest.fn(),
}));

jest.doMock(
  '../../../../src/services/notifications/notificationService',
  () => ({ sendFollowPromptNotifications: jest.fn() }),
);

jest.doMock('../../../../src/services/steamGridDbService', () => ({
  getGameImage: jest.fn().mockResolvedValue(null),
}));

jest.doMock('../../../../src/services/steam/apiClient', () => ({
  fetchGameDetails: jest.fn().mockResolvedValue(null),
}));

const {
  syncUserGames,
} = require('../../../../src/services/gamesSync/userProcessor');
const {
  addUserToGameSubscription,
} = require('../../../../src/services/users/subscriptionManager');
const {
  sendFollowPromptNotifications,
} = require('../../../../src/services/notifications/notificationService');
const User = require('../../../../src/models/User');
const Game = require('../../../../src/models/Game');
const {
  createUser,
  createGame,
} = require('../../../helpers/factories');

const HOUR = 60 * 60 * 1000;

describe('services/gamesSync/userProcessor', () => {
  beforeEach(() => {
    steamServiceMock.getUserGames.mockReset();
    steamServiceMock.getRecentlyPlayedGames.mockReset();
    addUserToGameSubscription.mockReset();
    sendFollowPromptNotifications.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('canSyncUser (cooldown 6h)', () => {
    it('skip si lastChecked < 6h', async () => {
      const user = await createUser({ lastChecked: new Date(Date.now() - HOUR) });
      const result = await syncUserGames(user);
      expect(result.skipped).toBe(true);
      expect(steamServiceMock.getUserGames).not.toHaveBeenCalled();
    });

    it('passe si lastChecked > 6h', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      const user = await createUser({ lastChecked: new Date(Date.now() - 7 * HOUR) });
      const result = await syncUserGames(user);
      expect(result.skipped).toBeUndefined();
    });

    it('force=true bypass le cooldown', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      const user = await createUser({ lastChecked: new Date() });
      const result = await syncUserGames(user, { force: true });
      expect(result.skipped).toBeUndefined();
      expect(steamServiceMock.getUserGames).toHaveBeenCalled();
    });
  });

  describe('réponses Steam invalides', () => {
    it('result.error si getUserGames ne renvoie pas un array', async () => {
      steamServiceMock.getUserGames.mockResolvedValue(null);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      const user = await createUser();
      const result = await syncUserGames(user);
      expect(result.error).toMatch(/Steam/);
    });

    it('GetRecentlyPlayedGames KO → fallback OwnedGames seulement (sans crash)', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockRejectedValue(new Error('429'));
      const user = await createUser();
      const result = await syncUserGames(user);
      expect(result.error).toBeNull();
    });
  });

  describe('libraryFollowMode = off', () => {
    it('ne déclenche ni auto-follow ni prompt', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
        { appid: 570, name: 'Dota' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);

      const user = await createUser({
        notificationSettings: { libraryFollowMode: 'off' },
      });

      const result = await syncUserGames(user);
      expect(result.updatedGames).toEqual([]);
      expect(result.followPrompts).toEqual([]);
      expect(addUserToGameSubscription).not.toHaveBeenCalled();
      expect(sendFollowPromptNotifications).not.toHaveBeenCalled();
    });
  });

  describe('libraryFollowMode = auto', () => {
    it('auto-follow les nouveaux jeux + appelle addUserToGameSubscription', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
        { appid: 570, name: 'Dota' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      addUserToGameSubscription.mockResolvedValue();

      const user = await createUser({
        notificationSettings: { libraryFollowMode: 'auto' },
      });

      const result = await syncUserGames(user);
      expect(result.updatedGames).toHaveLength(2);
      expect(result.updatedGames[0].action).toBe('auto-followed');
      expect(addUserToGameSubscription).toHaveBeenCalledTimes(2);

      const reloaded = await User.findById(user._id).lean();
      const followedIds = reloaded.followedGames.map((f) => f.appId);
      expect(followedIds.sort()).toEqual(['570', '730']);
    });

    it('skip les jeux avec un nom placeholder ("Jeu 730")', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'Jeu 730' },
        { appid: 570, name: 'Dota' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      addUserToGameSubscription.mockResolvedValue();

      const user = await createUser({
        notificationSettings: { libraryFollowMode: 'auto' },
      });

      const result = await syncUserGames(user);
      expect(result.updatedGames).toHaveLength(1);
      expect(result.updatedGames[0].appId).toBe('570');
    });
  });

  describe('libraryFollowMode = prompt', () => {
    it('génère des followPrompts et appelle sendFollowPromptNotifications', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      sendFollowPromptNotifications.mockResolvedValue(1);

      const user = await createUser({
        notificationSettings: { libraryFollowMode: 'prompt' },
      });

      const result = await syncUserGames(user);
      expect(result.updatedGames[0].action).toBe('prompt');
      expect(result.followPrompts).toHaveLength(1);
      expect(result.followPrompts[0]).toMatchObject({
        appId: '730',
        source: 'library',
      });
      expect(sendFollowPromptNotifications).toHaveBeenCalledWith(
        user.steamId,
        result.followPrompts,
      );
      // pas d'ajout direct
      expect(addUserToGameSubscription).not.toHaveBeenCalled();
    });
  });

  describe('Steam Family detection (diff recentlyPlayed ∖ owned)', () => {
    it('détecte un jeu Family et le tag source="family" en mode prompt', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([
        { appid: 730, name: 'CSGO', playtime_2weeks: 10, rtime_last_played: 0 },
        // Family : présent dans recentlyPlayed mais pas dans owned
        { appid: 999999, name: 'Hollow Knight', playtime_2weeks: 20, rtime_last_played: 0 },
      ]);
      sendFollowPromptNotifications.mockResolvedValue(1);

      const user = await createUser({
        notificationSettings: { libraryFollowMode: 'prompt' },
      });

      const result = await syncUserGames(user);
      const familyPrompt = result.followPrompts.find((p) => p.appId === '999999');
      expect(familyPrompt).toBeTruthy();
      expect(familyPrompt.source).toBe('family');
    });

    it('marque le jeu Family avec isFamilyShared:true dans gameLibrary', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([
        { appid: 999999, name: 'Hollow Knight', playtime_2weeks: 20 },
      ]);

      const user = await createUser();
      await syncUserGames(user);

      const reloaded = await User.findById(user._id).lean();
      const familyEntry = reloaded.gameLibrary.games.find(
        (g) => g.gameId === '999999',
      );
      expect(familyEntry).toBeTruthy();
      expect(familyEntry.isFamilyShared).toBe(true);
    });

    it('Family sticky : conserve l\'entrée même si absente du run suivant', async () => {
      // run 1 : on connaît le jeu Family
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([
        { appid: 999999, name: 'HK', playtime_2weeks: 20 },
      ]);

      const user = await createUser();
      await syncUserGames(user);

      // run 2 : Family game absent du recentlyPlayed
      const after1 = await User.findById(user._id);
      after1.lastChecked = new Date(Date.now() - 7 * HOUR); // bypass cooldown
      await after1.save();

      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      await syncUserGames(after1);

      const reloaded = await User.findById(user._id).lean();
      const familyEntry = reloaded.gameLibrary.games.find(
        (g) => g.gameId === '999999',
      );
      expect(familyEntry).toBeTruthy(); // sticky
      expect(familyEntry.isFamilyShared).toBe(true);
    });
  });

  describe('detectRemovedGames', () => {
    it('retire les jeux disparus de la lib Steam et les défollow', async () => {
      // run 1 : 2 jeux suivis
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
        { appid: 570, name: 'Dota' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);

      const user = await createUser({
        followedGames: ['730', '570'],
        notificationSettings: { libraryFollowMode: 'off' },
      });

      await syncUserGames(user);

      // run 2 : Dota disparaît
      const after1 = await User.findById(user._id);
      after1.lastChecked = new Date(Date.now() - 7 * HOUR);
      await after1.save();

      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
      ]);

      const result2 = await syncUserGames(after1);
      expect(result2.removedGames).toContain('570');

      const reloaded = await User.findById(user._id).lean();
      const followedIds = reloaded.followedGames.map((f) => f.appId);
      expect(followedIds).toEqual(['730']);
    });

    it('Family games ne déclenchent JAMAIS removedGames (sticky)', async () => {
      // run 1 : ajoute un family
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([
        { appid: 999999, name: 'HK', playtime_2weeks: 20 },
      ]);
      const user = await createUser();
      await syncUserGames(user);

      // run 2 : family disparaît du recentlyPlayed
      const after1 = await User.findById(user._id);
      after1.lastChecked = new Date(Date.now() - 7 * HOUR);
      await after1.save();
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);

      const result2 = await syncUserGames(after1);
      expect(result2.removedGames).toEqual([]);
    });
  });

  describe('garde anti-wipe (GetOwnedGames renvoie [] = profil privé/hoquet Steam)', () => {
    it('préserve la baseline : pas de rebuild, pas d\'unfollow, pas de prompt', async () => {
      // run 1 : 2 jeux possédés + suivis, mode prompt
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO' },
        { appid: 570, name: 'Dota' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      const user = await createUser({
        followedGames: ['730', '570'],
        notificationSettings: { libraryFollowMode: 'prompt' },
      });
      await syncUserGames(user);

      // run 2 : Steam renvoie [] (profil passé privé / hoquet)
      const after1 = await User.findById(user._id);
      after1.lastChecked = new Date(Date.now() - 7 * HOUR);
      await after1.save();
      sendFollowPromptNotifications.mockClear();
      steamServiceMock.getUserGames.mockResolvedValue([]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);

      const result2 = await syncUserGames(after1);

      expect(result2.skipped).toBe(true);
      expect(result2.removedGames).toEqual([]);
      expect(sendFollowPromptNotifications).not.toHaveBeenCalled();

      // baseline intacte : library + follows préservés, gamesVersion non bumpé
      const reloaded = await User.findById(user._id).lean();
      const libIds = reloaded.gameLibrary.games.map((g) => g.gameId).sort();
      expect(libIds).toEqual(['570', '730']);
      const followedIds = reloaded.followedGames.map((f) => f.appId).sort();
      expect(followedIds).toEqual(['570', '730']);
    });

    it('un user SANS biblio préalable + [] reste un sync normal (vide, pas de skip-garde)', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      const user = await createUser(); // gameLibrary vide
      const result = await syncUserGames(user);
      // pas la garde anti-wipe (rien à protéger) → sync normal complet
      expect(result.skipped).toBeUndefined();
      const reloaded = await User.findById(user._id).lean();
      expect(reloaded.lastChecked).toBeInstanceOf(Date); // baseline (vide) écrite
    });
  });

  describe('upsertGamesCollection', () => {
    it('insère les nouveaux jeux dans la collection Game', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'CSGO', img_icon_url: 'icon-hash' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);

      const user = await createUser();
      await syncUserGames(user);

      const game = await Game.findOne({ appId: '730' }).lean();
      expect(game).toMatchObject({ appId: '730', name: 'CSGO' });
    });

    it('auto-répare un name placeholder existant', async () => {
      await createGame({ appId: '730', name: 'Jeu 730' });
      steamServiceMock.getUserGames.mockResolvedValue([
        { appid: 730, name: 'Counter-Strike 2' },
      ]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);

      const user = await createUser();
      await syncUserGames(user);

      const game = await Game.findOne({ appId: '730' }).lean();
      expect(game.name).toBe('Counter-Strike 2');
    });
  });

  describe('result final', () => {
    it('met à jour lastChecked et gamesVersion', async () => {
      steamServiceMock.getUserGames.mockResolvedValue([]);
      steamServiceMock.getRecentlyPlayedGames.mockResolvedValue([]);
      const user = await createUser();
      const before = user.gamesVersion;
      await syncUserGames(user);

      const reloaded = await User.findById(user._id).lean();
      expect(reloaded.lastChecked).toBeInstanceOf(Date);
      expect(reloaded.gamesVersion).not.toBe(before);
    });
  });
});
