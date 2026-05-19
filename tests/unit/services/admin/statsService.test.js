const agendaMock = { jobs: jest.fn() };
let getAgendaImpl = () => agendaMock;

jest.doMock('../../../../src/config/cron', () => ({
  getAgenda: () => getAgendaImpl(),
  JOBS: {
    NEWS_CHECK: 'news-check',
    USER_GROUP_SYNC: 'user-group-sync',
    WISHLIST_SYNC: 'wishlist-sync',
  },
}));

const {
  getOverview,
  getPolling,
  getCrons,
  getAllStats,
} = require('../../../../src/services/admin/statsService');
const {
  createUser,
  createGame,
  createGameSubscription,
  createWishlist,
  createUserNewsState,
  nextSteamId,
} = require('../../../helpers/factories');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('services/admin/statsService', () => {
  beforeEach(() => {
    agendaMock.jobs.mockReset();
    getAgendaImpl = () => agendaMock;
  });

  describe('getOverview()', () => {
    it('compte les collections + users avec FCM + sommes followed + breakdown modes', async () => {
      await createUser({
        followedGames: ['730', '570'],
        notificationSettings: {
          libraryFollowMode: 'auto',
          wishlistFollowMode: 'off',
          fcmTokens: [{ token: 't1', platform: 'android' }],
        },
      });
      await createUser({
        followedGames: ['440'],
        notificationSettings: {
          libraryFollowMode: 'off',
          wishlistFollowMode: 'prompt',
        },
      });
      await createGame({ appId: '730', name: 'CSGO' });
      await createGameSubscription({ gameId: '730', name: 'CSGO' });
      await createWishlist({ appId: '12345', name: 'BF6' });
      await createUserNewsState({ steamId: nextSteamId(), appId: '730', newsId: 'n1' });

      const o = await getOverview();
      expect(o.counts.users).toBe(2);
      expect(o.counts.games).toBe(1);
      expect(o.counts.gameSubscriptions).toBe(1);
      expect(o.counts.wishlists).toBe(1);
      expect(o.counts.userNewsStates).toBe(1);
      expect(o.users.withFcmToken).toBe(1);
      expect(o.users.totalFollowedGames).toBe(3);
      expect(o.users.libraryFollowMode).toEqual({ auto: 1, off: 1 });
      expect(o.users.wishlistFollowMode).toEqual({ off: 1, prompt: 1 });
    });
  });

  describe('getPolling()', () => {
    it('classe les jeux par tier (hot/warm/cold/never_checked) avec eligible/pending', async () => {
      const now = Math.floor(Date.now() / 1000);
      await createGameSubscription({ gameId: '1', lastNewsCheck: null }); // never_checked + eligible
      await createGameSubscription({
        gameId: '2',
        lastNewsCheck: new Date(),
        lastNewsTimestamp: now - 5 * 24 * 60 * 60, // 5j → hot
        nextNewsCheckAt: new Date(Date.now() + HOUR), // pending
      });
      await createGameSubscription({
        gameId: '3',
        lastNewsCheck: new Date(),
        lastNewsTimestamp: now - 45 * 24 * 60 * 60, // 45j → warm
        nextNewsCheckAt: new Date(Date.now() - HOUR), // eligible
      });
      await createGameSubscription({
        gameId: '4',
        lastNewsCheck: new Date(),
        lastNewsTimestamp: now - 80 * 24 * 60 * 60, // 80j → cold
      });
      await createGameSubscription({
        gameId: '5',
        lastNewsCheck: new Date(),
        lastNewsTimestamp: 0, // cold_no_news
      });

      const p = await getPolling();
      expect(p.byTier.never_checked).toMatchObject({ total: 1 });
      expect(p.byTier.hot).toMatchObject({ total: 1, pending: 1 });
      expect(p.byTier.warm).toMatchObject({ total: 1, eligible: 1 });
      expect(p.byTier.cold).toMatchObject({ total: 1 });
      expect(p.byTier.cold_no_news).toMatchObject({ total: 1 });
      expect(p.tiers.hot).toBe(1);
      expect(p.cutoffs.hotMaxAgeDays).toBe(30);
      expect(p.cutoffs.warmMaxAgeDays).toBe(60);
      expect(p.eligibleNow).toBeGreaterThan(0);
    });

    it('renvoie objects vides si aucune subscription', async () => {
      const p = await getPolling();
      expect(p.byTier).toEqual({});
      expect(p.eligibleNow).toBe(0);
      expect(p.pending).toBe(0);
    });
  });

  describe('getCrons()', () => {
    it('initialized=false si Agenda absent', async () => {
      getAgendaImpl = () => null;
      const r = await getCrons();
      expect(r).toEqual({ initialized: false, jobs: [] });
    });

    it('liste les jobs Agenda avec attrs (nextRunAt, lastRunAt, failCount, ...)', async () => {
      agendaMock.jobs.mockResolvedValueOnce([
        {
          attrs: {
            name: 'news-check',
            nextRunAt: new Date('2026-05-19'),
            failCount: 2,
            failReason: 'oops',
          },
        },
        {
          attrs: {
            name: 'user-group-sync',
            nextRunAt: null,
          },
        },
      ]);

      const r = await getCrons();
      expect(r.initialized).toBe(true);
      expect(r.jobs).toHaveLength(2);
      // Tri par nom
      expect(r.jobs.map((j) => j.name)).toEqual(['news-check', 'user-group-sync']);
      expect(r.jobs[0].failCount).toBe(2);
      expect(r.jobs[0].failReason).toBe('oops');
      expect(r.jobs[1].failCount).toBe(0);
    });
  });

  describe('getAllStats()', () => {
    it('parallélise les 3 sections + meta', async () => {
      agendaMock.jobs.mockResolvedValue([]);
      const all = await getAllStats();
      expect(all).toHaveProperty('overview');
      expect(all).toHaveProperty('polling');
      expect(all).toHaveProperty('crons');
      expect(all.meta).toMatchObject({
        generatedAt: expect.any(String),
        durationMs: expect.any(Number),
      });
    });
  });
});
