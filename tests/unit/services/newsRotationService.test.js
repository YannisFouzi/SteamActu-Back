const { SteamApiError } = require('../../../src/services/steam/apiClient');

const steamServiceMock = {
  getGameNews: jest.fn(),
  SteamApiError,
};

jest.doMock('../../../src/services/steamService', () => steamServiceMock);

const notificationServiceMock = {
  sendNewsNotification: jest.fn(),
};

jest.doMock(
  '../../../src/services/notifications/notificationService',
  () => notificationServiceMock,
);

const {
  checkNewsRotation,
} = require('../../../src/services/newsRotationService');
const GameSubscription = require('../../../src/models/GameSubscription');
const UserNewsState = require('../../../src/models/UserNewsState');
const {
  createGameSubscription,
  createUser,
  nextSteamId,
} = require('../../helpers/factories');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function setupSubscriberWithToken(steamId) {
  return createUser({
    steamId,
    notificationSettings: {
      newsNotifications: true,
      fcmTokens: [{ token: 't1', platform: 'android' }],
    },
  });
}

describe('services/newsRotationService', () => {
  beforeEach(() => {
    steamServiceMock.getGameNews.mockReset();
    notificationServiceMock.sendNewsNotification.mockReset();
  });

  describe('checkNewsRotation() — sélection éligibilité', () => {
    it('renvoie 0 si aucun jeu éligible', async () => {
      // un jeu futur (non éligible)
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        nextNewsCheckAt: new Date(Date.now() + HOUR),
      });

      const stats = await checkNewsRotation();
      expect(stats.gamesChecked).toBe(0);
      expect(stats.apiCalls).toBe(0);
      expect(steamServiceMock.getGameNews).not.toHaveBeenCalled();
    });

    it('sélectionne les jeux avec nextNewsCheckAt null', async () => {
      steamServiceMock.getGameNews.mockResolvedValue([]);
      await createGameSubscription({ gameId: '730', name: 'A' });
      await createGameSubscription({ gameId: '570', name: 'B' });

      const stats = await checkNewsRotation();
      expect(stats.gamesChecked).toBe(2);
      expect(stats.apiCalls).toBe(2);
    });

    it('sélectionne aussi les jeux avec nextNewsCheckAt <= now', async () => {
      steamServiceMock.getGameNews.mockResolvedValue([]);
      await createGameSubscription({
        gameId: '730',
        name: 'A',
        nextNewsCheckAt: new Date(Date.now() - HOUR),
      });
      await createGameSubscription({
        gameId: '570',
        name: 'B',
        nextNewsCheckAt: new Date(Date.now() + HOUR),
      });

      const stats = await checkNewsRotation();
      expect(stats.gamesChecked).toBe(1);
    });
  });

  describe('checkNewsRotation() — tiers et cooldowns', () => {
    it('jeu sans news → tier cold (cooldown 12h)', async () => {
      steamServiceMock.getGameNews.mockResolvedValue([]);
      const sub = await createGameSubscription({ gameId: '730', name: 'A' });

      const stats = await checkNewsRotation();
      expect(stats.tiers.cold).toBe(1);

      const updated = await GameSubscription.findById(sub._id).lean();
      const elapsed = updated.nextNewsCheckAt.getTime() - updated.lastNewsCheck.getTime();
      expect(elapsed).toBeGreaterThanOrEqual(12 * HOUR - 1000);
      expect(elapsed).toBeLessThanOrEqual(12 * HOUR + 1000);
    });

    it('jeu avec news récente (<30j) → tier hot (cooldown 15min)', async () => {
      const recentTs = Math.floor((Date.now() - 5 * DAY) / 1000);
      steamServiceMock.getGameNews.mockResolvedValue([
        { gid: 'n1', title: 't', url: 'u', date: recentTs, contents: '' },
      ]);
      const sub = await createGameSubscription({
        gameId: '730',
        name: 'A',
        lastNewsTimestamp: recentTs - DAY / 1000,
      });

      const stats = await checkNewsRotation();
      expect(stats.tiers.hot).toBe(1);

      const updated = await GameSubscription.findById(sub._id).lean();
      const cooldown =
        updated.nextNewsCheckAt.getTime() - updated.lastNewsCheck.getTime();
      expect(cooldown).toBeCloseTo(15 * 60 * 1000, -3);
    });

    it('jeu avec news entre 30 et 60j → tier warm (cooldown 3h)', async () => {
      const tsWarm = Math.floor((Date.now() - 40 * DAY) / 1000);
      steamServiceMock.getGameNews.mockResolvedValue([]); // pas de nouvelle news
      const sub = await createGameSubscription({
        gameId: '730',
        name: 'A',
        lastNewsTimestamp: tsWarm,
        lastNewsCheck: new Date(Date.now() - HOUR),
      });

      const stats = await checkNewsRotation();
      expect(stats.tiers.warm).toBe(1);

      const updated = await GameSubscription.findById(sub._id).lean();
      const cooldown =
        updated.nextNewsCheckAt.getTime() - updated.lastNewsCheck.getTime();
      expect(cooldown).toBeCloseTo(3 * HOUR, -3);
    });
  });

  describe('checkNewsRotation() — détection news + notifications', () => {
    it('détecte une nouvelle news, met à jour lastNewsTimestamp, notifie les subscribers', async () => {
      const newTs = Math.floor(Date.now() / 1000);
      const oldTs = newTs - 7 * DAY / 1000;

      const subscriber1 = nextSteamId();
      const subscriber2 = nextSteamId();
      await setupSubscriberWithToken(subscriber1);
      await setupSubscriberWithToken(subscriber2);

      const sub = await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        lastNewsTimestamp: oldTs,
        subscribers: [subscriber1, subscriber2],
      });

      steamServiceMock.getGameNews.mockResolvedValue([
        {
          gid: 'news-new',
          title: 'Patch',
          url: 'https://x',
          date: newTs,
          contents: '<img src="https://img/1.jpg">',
        },
      ]);
      notificationServiceMock.sendNewsNotification.mockResolvedValue(true);

      const stats = await checkNewsRotation();

      expect(stats.newNewsFound).toBe(1);
      expect(stats.notificationsSent).toBe(2);
      expect(notificationServiceMock.sendNewsNotification).toHaveBeenCalledWith(
        expect.any(String),
        '730',
        'CSGO',
        'Patch',
        'https://x',
        'news-new',
        'https://img/1.jpg',
      );

      const updated = await GameSubscription.findById(sub._id).lean();
      expect(updated.lastNewsTimestamp).toBe(newTs);
    });

    it('skip les subscribers ayant déjà inFeedAt ou pushSentAt pour la même news', async () => {
      const newTs = Math.floor(Date.now() / 1000);
      const sA = nextSteamId();
      const sB = nextSteamId();
      await setupSubscriberWithToken(sA);
      await setupSubscriberWithToken(sB);

      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        lastNewsTimestamp: newTs - DAY,
        subscribers: [sA, sB],
      });

      // sA a déjà l'état pushSentAt → doit être skip
      await UserNewsState.create({
        steamId: sA,
        appId: '730',
        newsId: 'news-1',
        pushSentAt: new Date(),
        expiresAt: new Date(Date.now() + 90 * DAY),
      });

      steamServiceMock.getGameNews.mockResolvedValue([
        { gid: 'news-1', title: 't', url: 'u', date: newTs, contents: '' },
      ]);
      notificationServiceMock.sendNewsNotification.mockResolvedValue(true);

      const stats = await checkNewsRotation();

      expect(stats.notificationsSent).toBe(1);
      expect(notificationServiceMock.sendNewsNotification).toHaveBeenCalledTimes(1);
      expect(
        notificationServiceMock.sendNewsNotification.mock.calls[0][0],
      ).toBe(sB);
    });

    it('écrit pushSentAt UNIQUEMENT pour les subscribers où sendNewsNotification renvoie true', async () => {
      const newTs = Math.floor(Date.now() / 1000);
      const sA = nextSteamId();
      const sB = nextSteamId();
      await setupSubscriberWithToken(sA);
      await setupSubscriberWithToken(sB);

      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        lastNewsTimestamp: newTs - DAY,
        subscribers: [sA, sB],
      });

      steamServiceMock.getGameNews.mockResolvedValue([
        { gid: 'n1', title: 't', url: 'u', date: newTs, contents: '' },
      ]);
      // sA succès, sB échec
      notificationServiceMock.sendNewsNotification
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await checkNewsRotation();

      const states = await UserNewsState.find({
        appId: '730',
        newsId: 'n1',
      }).lean();
      const bySteam = Object.fromEntries(states.map((s) => [s.steamId, s]));
      expect(bySteam[sA]?.pushSentAt).toBeTruthy();
      expect(bySteam[sB]).toBeUndefined();
    });

    it('n\'envoie PAS de notif si la news n\'est pas plus récente', async () => {
      const currentTs = Math.floor(Date.now() / 1000);
      const subscriber = nextSteamId();
      await setupSubscriberWithToken(subscriber);

      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        lastNewsTimestamp: currentTs,
        subscribers: [subscriber],
      });

      steamServiceMock.getGameNews.mockResolvedValue([
        { gid: 'old', title: 't', url: 'u', date: currentTs - 100, contents: '' },
      ]);

      const stats = await checkNewsRotation();
      expect(stats.newNewsFound).toBe(0);
      expect(notificationServiceMock.sendNewsNotification).not.toHaveBeenCalled();
    });
  });

  describe('checkNewsRotation() — gestion d\'erreurs', () => {
    it('403/404 (SteamApiError isExpected) → retry 24h', async () => {
      const sub = await createGameSubscription({ gameId: '730', name: 'A' });
      steamServiceMock.getGameNews.mockRejectedValue(
        new SteamApiError('forbidden', { status: 403 }),
      );

      const stats = await checkNewsRotation();
      expect(stats.errors).toHaveLength(0); // expected, pas une erreur

      const updated = await GameSubscription.findById(sub._id).lean();
      const cooldown =
        updated.nextNewsCheckAt.getTime() - updated.lastNewsCheck.getTime();
      expect(cooldown).toBeCloseTo(24 * HOUR, -3);
    });

    it('429 (rate limit) → retry 1h', async () => {
      const sub = await createGameSubscription({ gameId: '730', name: 'A' });
      steamServiceMock.getGameNews.mockRejectedValue(
        new SteamApiError('429', { status: 429 }),
      );

      await checkNewsRotation();

      const updated = await GameSubscription.findById(sub._id).lean();
      const cooldown =
        updated.nextNewsCheckAt.getTime() - updated.lastNewsCheck.getTime();
      expect(cooldown).toBeCloseTo(HOUR, -3);
    });

    it('vraie erreur (5xx, réseau) → retry 15min + push erreur dans stats', async () => {
      const sub = await createGameSubscription({ gameId: '730', name: 'A' });
      steamServiceMock.getGameNews.mockRejectedValue(
        new SteamApiError('boom', { status: 503 }),
      );

      const stats = await checkNewsRotation();
      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0].gameId).toBe('730');

      const updated = await GameSubscription.findById(sub._id).lean();
      const cooldown =
        updated.nextNewsCheckAt.getTime() - updated.lastNewsCheck.getTime();
      expect(cooldown).toBeCloseTo(15 * 60 * 1000, -3);
    });
  });

  describe('checkNewsRotation() — concurrence', () => {
    it('skip si une rotation est déjà en cours (concurrent run)', async () => {
      steamServiceMock.getGameNews.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
      );
      await createGameSubscription({ gameId: '730', name: 'A' });

      const first = checkNewsRotation();
      const second = await checkNewsRotation();

      expect(second).toMatchObject({ skipped: true, gamesChecked: 0 });
      await first;
    });
  });
});
