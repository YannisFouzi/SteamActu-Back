const gridConfig = {
  apiKey: 'test-grid-key',
  baseUrl: 'https://www.steamgriddb.com/api/v2',
};

jest.doMock('../../../src/config/app', () => ({
  STEAMGRIDDB_CONFIG: gridConfig,
}));

const axiosInstance = { get: jest.fn() };
jest.doMock('axios', () => ({
  create: jest.fn(() => axiosInstance),
}));

const {
  getGameImage,
} = require('../../../src/services/steamGridDbService');
const logger = require('../../../src/utils/logger');

function ok(data) {
  return { data: { data } };
}

describe('services/steamGridDbService', () => {
  beforeEach(() => {
    axiosInstance.get.mockReset();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('renvoie null si appId absent', async () => {
    expect(await getGameImage(null)).toBeNull();
    expect(axiosInstance.get).not.toHaveBeenCalled();
  });

  it('renvoie null si apiKey absente', async () => {
    gridConfig.apiKey = '';
    try {
      expect(await getGameImage(730)).toBeNull();
    } finally {
      gridConfig.apiKey = 'test-grid-key';
    }
  });

  it('étage 1 : icons official PNG → plus haute résolution', async () => {
    axiosInstance.get.mockResolvedValueOnce(ok([
      { url: 'small.png', width: 64 },
      { url: 'big.png', width: 256 },
    ]));

    expect(await getGameImage(730)).toBe('big.png');
    expect(axiosInstance.get).toHaveBeenCalledWith(
      '/icons/steam/730',
      expect.objectContaining({
        params: { styles: 'official', mimes: 'image/png' },
      }),
    );
  });

  it('étage 2 : icons tout style si étage 1 vide, préfère PNG', async () => {
    axiosInstance.get
      .mockResolvedValueOnce({ data: { data: null } }) // étage 1
      .mockResolvedValueOnce(ok([
        { url: 'jpg.jpg', mime: 'image/jpeg', width: 1024 },
        { url: 'png.png', mime: 'image/png', width: 128 },
      ]));

    expect(await getGameImage(730)).toBe('png.png');
  });

  it('étage 3 : logos si étages 1+2 vides', async () => {
    axiosInstance.get
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce(ok([{ url: 'logo.png', width: 512 }]));

    expect(await getGameImage(730)).toBe('logo.png');
  });

  it('étage 4 : grids thumbnail si étages 1-3 vides', async () => {
    axiosInstance.get
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce(ok([
        { thumb: 'thumb.jpg', url: 'big.jpg', width: 600 },
      ]));

    expect(await getGameImage(730)).toBe('thumb.jpg');
  });

  it('étage 5 : recherche par nom + cascade interne si tous les étages appId échouent', async () => {
    axiosInstance.get
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce(ok([{ id: 7777 }])) // /search/autocomplete
      .mockResolvedValueOnce(ok([{ url: 'by-name.png', width: 200 }])); // /icons/game/7777 official

    expect(await getGameImage(730, 'Forza Horizon 6')).toBe('by-name.png');
  });

  it('404 silencieux (pas de logger.error)', async () => {
    logger.error.mockClear();
    axiosInstance.get
      .mockRejectedValueOnce({ response: { status: 404 }, message: 'nf' })
      .mockResolvedValue({ data: { data: null } });

    expect(await getGameImage(730)).toBeNull();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('autres erreurs : log mais retourne null', async () => {
    logger.error.mockClear();
    axiosInstance.get
      .mockRejectedValueOnce({ response: { status: 500 }, message: 'boom' })
      .mockResolvedValue({ data: { data: null } });

    expect(await getGameImage(730)).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('renvoie null final si rien ne marche et pas de gameName', async () => {
    axiosInstance.get
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: null } })
      .mockResolvedValueOnce({ data: { data: null } });

    expect(await getGameImage(730)).toBeNull();
  });
});
