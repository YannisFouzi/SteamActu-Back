const notificationConfig = { provider: 'simulation' };

jest.doMock('../../../../src/config/app', () => ({
  NOTIFICATION_CONFIG: notificationConfig,
}));

const messagingMock = {
  sendEachForMulticast: jest.fn(),
};
const adminMock = {
  initializeApp: jest.fn(),
  credential: { cert: jest.fn().mockReturnValue('cred') },
  messaging: jest.fn().mockReturnValue(messagingMock),
};
jest.doMock('firebase-admin', () => adminMock);

function loadProvidersFresh() {
  jest.resetModules();
  jest.doMock('../../../../src/config/app', () => ({
    NOTIFICATION_CONFIG: notificationConfig,
  }));
  jest.doMock('firebase-admin', () => adminMock);
  return require('../../../../src/services/notifications/providers');
}

describe('services/notifications/providers', () => {
  let providers;

  beforeEach(() => {
    messagingMock.sendEachForMulticast.mockReset();
    adminMock.initializeApp.mockReset();
    providers = loadProvidersFresh();
  });

  describe('simulationProvider()', () => {
    it('résout true après ~100ms', async () => {
      jest.useFakeTimers();
      const p = providers.simulationProvider('token-1', { title: 'hi' });
      jest.advanceTimersByTime(100);
      jest.useRealTimers();
      expect(await p).toBe(true);
    });
  });

  describe('getActiveProvider()', () => {
    it('renvoie simulationProvider par défaut', () => {
      notificationConfig.provider = 'simulation';
      providers = loadProvidersFresh();
      expect(providers.getActiveProvider()).toBe(providers.simulationProvider);
    });

    it('renvoie firebaseProvider si provider="firebase"', () => {
      notificationConfig.provider = 'firebase';
      providers = loadProvidersFresh();
      expect(providers.getActiveProvider()).toBe(providers.firebaseProvider);
    });

    it('renvoie oneSignalProvider si provider="onesignal"', () => {
      notificationConfig.provider = 'onesignal';
      providers = loadProvidersFresh();
      expect(providers.getActiveProvider()).toBe(providers.oneSignalProvider);
    });

    it('insensible à la casse', () => {
      notificationConfig.provider = 'FIREBASE';
      providers = loadProvidersFresh();
      expect(providers.getActiveProvider()).toBe(providers.firebaseProvider);
    });

    it('défaut simulation si provider inconnu', () => {
      notificationConfig.provider = 'wat';
      providers = loadProvidersFresh();
      expect(providers.getActiveProvider()).toBe(providers.simulationProvider);
    });
  });

  describe('firebaseProvider()', () => {
    beforeEach(() => {
      providers = loadProvidersFresh();
      // simule des creds disponibles
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({
        type: 'service_account',
        project_id: 'p',
      });
    });

    afterEach(() => {
      delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    });

    it('renvoie true (success) quand FCM accepte tous les tokens', async () => {
      messagingMock.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });

      const result = await providers.firebaseProvider(['t1', 't2'], {
        title: 'hi',
        body: 'world',
        data: { type: 'news', appId: '730' },
      });

      expect(result).toBe(true);
      expect(adminMock.initializeApp).toHaveBeenCalledTimes(1);
      const callArg = messagingMock.sendEachForMulticast.mock.calls[0][0];
      expect(callArg.tokens).toEqual(['t1', 't2']);
      // Notif natif (allowUnfollow false, type=news) → on attend la clé notification
      expect(callArg.notification).toBeDefined();
    });

    it('mode data-only (Notifee) si allowUnfollow=true', async () => {
      messagingMock.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      await providers.firebaseProvider('t1', {
        title: 'hi',
        body: 'world',
        data: { type: 'news', appId: '730', allowUnfollow: true },
      });

      const arg = messagingMock.sendEachForMulticast.mock.calls[0][0];
      expect(arg.notification).toBeUndefined();
      expect(arg.data.allowUnfollow).toBe('true');
    });

    it('mode data-only si type=follow_prompt', async () => {
      messagingMock.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      await providers.firebaseProvider('t1', {
        title: 'hi',
        body: 'w',
        data: { type: 'follow_prompt', appId: '730' },
      });

      const arg = messagingMock.sendEachForMulticast.mock.calls[0][0];
      expect(arg.notification).toBeUndefined();
    });

    it('stringifie toutes les valeurs data (contrainte FCM)', async () => {
      messagingMock.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }],
      });

      await providers.firebaseProvider('t1', {
        title: 'hi',
        body: 'w',
        data: { type: 'news', appId: 730, count: 5 },
      });

      const arg = messagingMock.sendEachForMulticast.mock.calls[0][0];
      Object.values(arg.data).forEach((v) => expect(typeof v).toBe('string'));
    });

    it('renvoie { success, invalidTokens } sur erreurs permanentes', async () => {
      messagingMock.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 1,
        failureCount: 2,
        responses: [
          { success: true },
          {
            success: false,
            error: { code: 'messaging/registration-token-not-registered' },
          },
          {
            success: false,
            error: { code: 'messaging/invalid-registration-token' },
          },
        ],
      });

      const result = await providers.firebaseProvider(['t1', 't2', 't3'], {
        title: 'hi',
        body: 'w',
        data: { type: 'news' },
      });

      expect(result).toEqual({
        success: true,
        invalidTokens: ['t2', 't3'],
      });
    });

    it('ne marque pas pour suppression les erreurs temporaires (quota, server-unavailable)', async () => {
      messagingMock.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 0,
        failureCount: 1,
        responses: [
          { success: false, error: { code: 'messaging/quota-exceeded' } },
        ],
      });

      const result = await providers.firebaseProvider(['t1'], {
        title: 'x',
        body: 'y',
        data: { type: 'news' },
      });

      expect(result).toBe(false);
    });

    it('warn + return false si tokens array vide', async () => {
      const result = await providers.firebaseProvider([], {
        title: 'x',
        body: 'y',
        data: {},
      });
      expect(result).toBe(false);
      expect(messagingMock.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('fallback simulation si init Firebase échoue (creds invalides)', async () => {
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON = 'not json';
      providers = loadProvidersFresh();

      const result = await providers.firebaseProvider('t1', {
        title: 'x',
        body: 'y',
        data: {},
      });

      expect(result).toBe(true); // simulation renvoie true
      expect(messagingMock.sendEachForMulticast).not.toHaveBeenCalled();
    });
  });

  describe('oneSignalProvider()', () => {
    it('délègue à simulationProvider (placeholder)', async () => {
      jest.useFakeTimers();
      const p = providers.oneSignalProvider('t1', { title: 'hi' });
      jest.advanceTimersByTime(100);
      jest.useRealTimers();
      expect(await p).toBe(true);
    });
  });
});
