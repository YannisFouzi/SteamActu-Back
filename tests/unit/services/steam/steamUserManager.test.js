jest.mock('../../../../src/services/steam/apiClient', () => ({
  fetchUserProfile: jest.fn(),
}));

jest.mock('../../../../src/services/steam/visibilityCheck', () => ({
  checkGamesVisibility: jest.fn(),
}));

jest.mock('../../../../src/services/gamesSync/userProcessor', () => ({
  syncUserGames: jest.fn(),
}));

const {
  registerOrUpdateUser,
} = require('../../../../src/services/steam/steamUserManager');
const {
  fetchUserProfile,
} = require('../../../../src/services/steam/apiClient');
const {
  checkGamesVisibility,
} = require('../../../../src/services/steam/visibilityCheck');
const {
  syncUserGames,
} = require('../../../../src/services/gamesSync/userProcessor');
const User = require('../../../../src/models/User');
const { createUser, nextSteamId } = require('../../../helpers/factories');

describe('services/steam/steamUserManager', () => {
  beforeEach(() => {
    fetchUserProfile.mockReset();
    checkGamesVisibility.mockReset();
    syncUserGames.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('registerOrUpdateUser()', () => {
    it('crée un nouvel utilisateur et déclenche la sync si profil public', async () => {
      const steamId = nextSteamId();
      fetchUserProfile.mockResolvedValueOnce({ steamid: steamId, personaname: 'A' });
      checkGamesVisibility.mockResolvedValueOnce(true);
      syncUserGames.mockResolvedValueOnce();

      const user = await registerOrUpdateUser(steamId, 'fr');

      expect(user).toBeTruthy();
      expect(user.steamId).toBe(steamId);
      expect(user.language).toBe('fr');
      expect(fetchUserProfile).toHaveBeenCalledWith(steamId);
      expect(checkGamesVisibility).toHaveBeenCalledWith(steamId);
      expect(syncUserGames).toHaveBeenCalledTimes(1);
    });

    it('crée un user sans sync si profil privé', async () => {
      const steamId = nextSteamId();
      fetchUserProfile.mockResolvedValueOnce({ steamid: steamId });
      checkGamesVisibility.mockResolvedValueOnce(false);

      const user = await registerOrUpdateUser(steamId, 'en');

      expect(user.steamId).toBe(steamId);
      expect(syncUserGames).not.toHaveBeenCalled();
    });

    it('normalise la langue passée (en-US → en)', async () => {
      const steamId = nextSteamId();
      fetchUserProfile.mockResolvedValueOnce({ steamid: steamId });
      checkGamesVisibility.mockResolvedValueOnce(false);

      const user = await registerOrUpdateUser(steamId, 'en-US');
      expect(user.language).toBe('en');
    });

    it('utilise DEFAULT_LANGUAGE=fr si langue non supportée', async () => {
      const steamId = nextSteamId();
      fetchUserProfile.mockResolvedValueOnce({ steamid: steamId });
      checkGamesVisibility.mockResolvedValueOnce(false);

      const user = await registerOrUpdateUser(steamId, 'jp');
      expect(user.language).toBe('fr');
    });

    it('met à jour la langue d\'un user existant si elle change', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, language: 'fr' });

      const user = await registerOrUpdateUser(steamId, 'en');
      expect(user.language).toBe('en');
      expect(fetchUserProfile).not.toHaveBeenCalled();
    });

    it('ne touche pas à la langue si pas explicitement fournie', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, language: 'de' });

      const user = await registerOrUpdateUser(steamId, undefined);
      expect(user.language).toBe('de');
    });

    it('lève si fetchUserProfile retourne null', async () => {
      const steamId = nextSteamId();
      fetchUserProfile.mockResolvedValueOnce(null);

      await expect(registerOrUpdateUser(steamId, 'fr')).rejects.toThrow(
        /Unable to fetch Steam profile/,
      );

      const exists = await User.findOne({ steamId });
      expect(exists).toBeNull();
    });

    it('n\'échoue pas si la sync initiale lève (erreur loggée seulement)', async () => {
      const steamId = nextSteamId();
      fetchUserProfile.mockResolvedValueOnce({ steamid: steamId });
      checkGamesVisibility.mockResolvedValueOnce(true);
      syncUserGames.mockRejectedValueOnce(new Error('sync down'));

      const user = await registerOrUpdateUser(steamId, 'fr');
      expect(user).toBeTruthy();
    });
  });
});
