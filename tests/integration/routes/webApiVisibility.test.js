// Happy-path des routes « Vérifier mon profil » côté web (plugin Millennium /
// site / extension) : avec une preuve d'identité valide, la route teste la
// visibilité Steam et déclenche le sync. Le refus 401 sans preuve est couvert
// par webApiAuth.test.js ; ici on valide le branchement route → service +
// délégation des sync. On mocke l'API Steam et les sync (on teste la route, pas
// les appels réseau réels). Mêmes mocks que steam.test.js → le service partagé
// (visibilityCheckService) se comporte à l'identique sur les deux surfaces.
jest.doMock('../../../src/services/steam/apiClient', () => ({
  fetchGameDetails: jest.fn(),
  fetchUserGames: jest.fn(),
  fetchUserWishlist: jest.fn(),
}));

jest.doMock('../../../src/services/gamesSync/userProcessor', () => ({
  syncUserGames: jest.fn().mockResolvedValue({ updatedGames: [] }),
}));

jest.doMock('../../../src/services/syncWishlistService', () => ({
  syncUserWishlist: jest.fn().mockResolvedValue({ success: true }),
}));

const request = require('supertest');
const { createTestApp } = require('../../helpers/createTestApp');
const apiClient = require('../../../src/services/steam/apiClient');
const {
  syncUserGames,
} = require('../../../src/services/gamesSync/userProcessor');
const {
  syncUserWishlist,
} = require('../../../src/services/syncWishlistService');
const { createUser, nextSteamId } = require('../../helpers/factories');
const {
  createMobileSession,
} = require('../../../src/services/mobileSessionService');

const app = createTestApp({ mount: ['web'] });

// Les writes /api/web exigent une preuve (requireWebAuth). En test on prouve via
// la session Bearer liée au steamId (équivalent OpenID côté navigateur/extension).
const bearer = (steamId) => `Bearer ${createMobileSession(steamId).token}`;

describe('webApi — Vérifier mon profil (check-visibility)', () => {
  beforeEach(() => {
    Object.values(apiClient).forEach((fn) => fn?.mockReset?.());
    syncUserGames.mockReset().mockResolvedValue({ updatedGames: [] });
    syncUserWishlist.mockReset().mockResolvedValue({ success: true });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('POST /api/web/check-visibility/:steamId', () => {
    it('preuve valide + jeux visibles → 200 visible=true et lance le sync', async () => {
      apiClient.fetchUserGames.mockResolvedValueOnce([
        { appid: 730, name: 'CSGO', playtime_forever: 100 },
      ]);
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app)
        .post(`/api/web/check-visibility/${steamId}`)
        .set('Authorization', bearer(steamId));

      expect(r.status).toBe(200);
      expect(r.body.visible).toBe(true);
      expect(r.body.gamesCount).toBe(1);
      expect(syncUserGames).toHaveBeenCalled();
      expect(syncUserWishlist).toHaveBeenCalledWith(steamId);
    });

    it('profil privé (jeux + wishlist vides) → 200 visible=false, pas de sync jeux', async () => {
      apiClient.fetchUserGames.mockResolvedValueOnce([]);
      apiClient.fetchUserWishlist.mockResolvedValueOnce([]);
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app)
        .post(`/api/web/check-visibility/${steamId}`)
        .set('Authorization', bearer(steamId));

      expect(r.status).toBe(200);
      expect(r.body.visible).toBe(false);
      expect(r.body.wishlistVisible).toBe(false);
      expect(syncUserGames).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/web/check-wishlist-visibility/:steamId', () => {
    it('preuve valide + wishlist visible → 200 visible=true et sync wishlist', async () => {
      apiClient.fetchUserWishlist.mockResolvedValueOnce([{ appid: 570 }]);
      apiClient.fetchUserGames.mockResolvedValueOnce([]);
      const steamId = nextSteamId();
      await createUser({ steamId });

      const r = await request(app)
        .post(`/api/web/check-wishlist-visibility/${steamId}`)
        .set('Authorization', bearer(steamId));

      expect(r.status).toBe(200);
      expect(r.body.visible).toBe(true);
      expect(r.body.wishlistVisible).toBe(true);
      expect(syncUserWishlist).toHaveBeenCalled();
    });
  });
});
