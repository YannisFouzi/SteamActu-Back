const gamesSyncMock = { syncUserGames: jest.fn() };
const wishlistMock = { syncUserWishlist: jest.fn() };

jest.doMock('../../../src/services/gamesSync', () => gamesSyncMock);
jest.doMock('../../../src/services/syncWishlistService', () => wishlistMock);

const {
  refreshUserAccount,
} = require('../../../src/services/accountRefreshService');
const { createUser, nextSteamId } = require('../../helpers/factories');

describe('services/accountRefreshService — refreshUserAccount', () => {
  beforeEach(() => {
    gamesSyncMock.syncUserGames.mockReset();
    wishlistMock.syncUserWishlist.mockReset();
  });

  it('ok:false si user inexistant (ne sync rien)', async () => {
    const out = await refreshUserAccount('76561190000000000');
    expect(out).toEqual({ ok: false, error: 'user_not_found' });
    expect(gamesSyncMock.syncUserGames).not.toHaveBeenCalled();
    expect(wishlistMock.syncUserWishlist).not.toHaveBeenCalled();
  });

  it('appelle syncUserGames(user) + syncUserWishlist(steamId) et renvoie ok', async () => {
    const steamId = nextSteamId();
    await createUser({ steamId });
    gamesSyncMock.syncUserGames.mockResolvedValue({ added: 2 });
    wishlistMock.syncUserWishlist.mockResolvedValue({ added: 1 });

    const out = await refreshUserAccount(steamId);

    expect(out.ok).toBe(true);
    expect(gamesSyncMock.syncUserGames).toHaveBeenCalledTimes(1);
    expect(gamesSyncMock.syncUserGames.mock.calls[0][0].steamId).toBe(steamId);
    expect(wishlistMock.syncUserWishlist).toHaveBeenCalledWith(steamId);
  });

  it('ok:false si un sync throw (erreur encapsulée)', async () => {
    const steamId = nextSteamId();
    await createUser({ steamId });
    gamesSyncMock.syncUserGames.mockRejectedValue(new Error('steam down'));

    const out = await refreshUserAccount(steamId);
    expect(out).toEqual({ ok: false, error: 'refresh_failed' });
  });
});
