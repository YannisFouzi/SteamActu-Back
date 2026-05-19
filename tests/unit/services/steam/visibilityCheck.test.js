jest.mock('../../../../src/services/steam/apiClient', () => ({
  fetchUserGames: jest.fn(),
}));

const {
  checkGamesVisibility,
} = require('../../../../src/services/steam/visibilityCheck');
const { fetchUserGames } = require('../../../../src/services/steam/apiClient');

describe('services/steam/visibilityCheck', () => {
  beforeEach(() => {
    fetchUserGames.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('retourne true quand fetchUserGames renvoie au moins un jeu', async () => {
    fetchUserGames.mockResolvedValueOnce([{ appid: 730 }]);
    expect(await checkGamesVisibility('76561197960287930')).toBe(true);
  });

  it('retourne false quand le tableau est vide', async () => {
    fetchUserGames.mockResolvedValueOnce([]);
    expect(await checkGamesVisibility('x')).toBe(false);
  });

  it('retourne false si fetchUserGames ne renvoie pas un array', async () => {
    fetchUserGames.mockResolvedValueOnce(null);
    expect(await checkGamesVisibility('x')).toBe(false);
  });

  it('retourne false (ne propage pas) en cas d\'erreur', async () => {
    fetchUserGames.mockRejectedValueOnce(new Error('boom'));
    expect(await checkGamesVisibility('x')).toBe(false);
  });
});
