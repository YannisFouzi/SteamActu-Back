const newsFeedServiceMock = { getNewsFeed: jest.fn() };
jest.doMock('../../../src/services/newsFeedService', () => newsFeedServiceMock);

const {
  getPendingDesktopToasts,
} = require('../../../src/services/desktopToastService');
const UserNewsState = require('../../../src/models/UserNewsState');
const User = require('../../../src/models/User');
const {
  createUser,
  createUserNewsState,
  nextSteamId,
} = require('../../helpers/factories');

function feedItem(appId, newsId, dateMs) {
  return {
    appId,
    gameName: `Game ${appId}`,
    gameLogoUrl: null,
    news: {
      id: newsId,
      title: `t-${newsId}`,
      url: `https://x/${newsId}`,
      ...(dateMs !== undefined ? { date: dateMs } : {}),
    },
  };
}

describe('services/desktopToastService — getPendingDesktopToasts', () => {
  beforeEach(() => newsFeedServiceMock.getNewsFeed.mockReset());

  it('1er appel (pas seedé) : seed silencieux — ne toaste rien, marque tout, pose desktopToastSeededAt', async () => {
    const steamId = nextSteamId();
    await createUser({ steamId });
    newsFeedServiceMock.getNewsFeed.mockResolvedValue({
      items: [feedItem('730', 'n1'), feedItem('570', 'n2')],
    });

    const out = await getPendingDesktopToasts(steamId, {});
    expect(out).toEqual([]); // rien toasté au premier contact

    const rows = await UserNewsState.find({ steamId }).lean();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.steamToastSentAt)).toBe(true);

    const user = await User.findOne({ steamId }).lean();
    expect(user.desktopToastSeededAt).toBeTruthy();
  });

  it('après seed : une news jamais notifiée est renvoyée ET marquée steamToastSentAt', async () => {
    const steamId = nextSteamId();
    await createUser({ steamId, desktopToastSeededAt: new Date() });
    newsFeedServiceMock.getNewsFeed.mockResolvedValue({
      items: [feedItem('730', 'fresh')],
    });

    const out = await getPendingDesktopToasts(steamId, {});
    expect(out).toHaveLength(1);
    expect(out[0].news.id).toBe('fresh');

    const row = await UserNewsState.findOne({ steamId, newsId: 'fresh' }).lean();
    expect(row.steamToastSentAt).toBeTruthy();
  });

  it('après seed : un jeu en suivi silencieux (notifications:false) ne toaste pas, mais sa news est claim silencieusement', async () => {
    const steamId = nextSteamId();
    await createUser({
      steamId,
      desktopToastSeededAt: new Date(),
      followedGames: [
        { appId: '730', followedAt: new Date(), notifications: false }, // muté
        { appId: '570', followedAt: new Date() }, // legacy → notifié
      ],
    });
    newsFeedServiceMock.getNewsFeed.mockResolvedValue({
      items: [feedItem('730', 'muted-news'), feedItem('570', 'normal-news')],
    });

    const out = await getPendingDesktopToasts(steamId, {});
    // Seul le jeu non muté toaste
    expect(out).toHaveLength(1);
    expect(out[0].appId).toBe('570');

    // La news mutée est quand même claim (pas de re-toast si la cloche se réactive)
    const mutedRow = await UserNewsState.findOne({ steamId, newsId: 'muted-news' }).lean();
    expect(mutedRow.steamToastSentAt).toBeTruthy();
  });

  it('après seed : une news ANTÉRIEURE au follow (backlog d\'un re-follow) n\'est pas toastée mais est claim', async () => {
    const steamId = nextSteamId();
    const followedAt = new Date('2026-06-12T00:00:00Z');
    const oldNewsMs = new Date('2026-06-06T00:00:00Z').getTime(); // 6 jours avant
    await createUser({
      steamId,
      desktopToastSeededAt: new Date('2026-06-01T00:00:00Z'),
      followedGames: [{ appId: '730', followedAt }],
    });
    newsFeedServiceMock.getNewsFeed.mockResolvedValue({
      items: [feedItem('730', 'old-backlog', oldNewsMs)],
    });

    const out = await getPendingDesktopToasts(steamId, {});
    expect(out).toEqual([]); // pré-follow → jamais toasté

    // mais consommée silencieusement (pas de re-toast plus tard)
    const row = await UserNewsState.findOne({ steamId, newsId: 'old-backlog' }).lean();
    expect(row.steamToastSentAt).toBeTruthy();
  });

  it('après seed : une news POSTÉRIEURE au follow est toastée normalement', async () => {
    const steamId = nextSteamId();
    const followedAt = new Date('2026-06-06T00:00:00Z');
    const freshNewsMs = new Date('2026-06-12T00:00:00Z').getTime(); // après le follow
    await createUser({
      steamId,
      desktopToastSeededAt: new Date('2026-06-01T00:00:00Z'),
      followedGames: [{ appId: '730', followedAt }],
    });
    newsFeedServiceMock.getNewsFeed.mockResolvedValue({
      items: [feedItem('730', 'after-follow', freshNewsMs)],
    });

    const out = await getPendingDesktopToasts(steamId, {});
    expect(out.map((i) => i.news.id)).toEqual(['after-follow']);
  });

  it('après seed : une news déjà poussée sur MOBILE (pushSentAt) n\'est PAS re-toastée sur desktop', async () => {
    const steamId = nextSteamId();
    await createUser({ steamId, desktopToastSeededAt: new Date() });
    await createUserNewsState({
      steamId,
      appId: '730',
      newsId: 'pushed',
      pushSentAt: new Date(),
    });
    newsFeedServiceMock.getNewsFeed.mockResolvedValue({
      items: [feedItem('730', 'pushed')],
    });

    const out = await getPendingDesktopToasts(steamId, {});
    expect(out).toEqual([]); // déjà eu sur le tel → pas de doublon desktop
  });

  it('après seed : une news déjà toastée (steamToastSentAt) n\'est pas re-toastée', async () => {
    const steamId = nextSteamId();
    await createUser({ steamId, desktopToastSeededAt: new Date() });
    await createUserNewsState({
      steamId,
      appId: '730',
      newsId: 'toasted',
      steamToastSentAt: new Date(),
    });
    newsFeedServiceMock.getNewsFeed.mockResolvedValue({
      items: [feedItem('730', 'toasted')],
    });

    const out = await getPendingDesktopToasts(steamId, {});
    expect(out).toEqual([]);
  });

  it('après seed : mélange — toaste seulement la nouvelle, pas celle déjà poussée mobile', async () => {
    const steamId = nextSteamId();
    await createUser({ steamId, desktopToastSeededAt: new Date() });
    await createUserNewsState({
      steamId,
      appId: '730',
      newsId: 'pushed',
      pushSentAt: new Date(),
    });
    newsFeedServiceMock.getNewsFeed.mockResolvedValue({
      items: [feedItem('730', 'pushed'), feedItem('570', 'fresh')],
    });

    const out = await getPendingDesktopToasts(steamId, {});
    expect(out.map((i) => i.news.id)).toEqual(['fresh']);
  });
});
