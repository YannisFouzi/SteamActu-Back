describe('services/authAttemptStore', () => {
  let store;

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    store = require('../../../src/services/authAttemptStore');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createAttempt()', () => {
    it('renvoie un authToken UUID + steamId null + expiresAt futur', () => {
      const a = store.createAttempt();
      expect(a.authToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(a.steamId).toBeNull();
      expect(a.expiresAt).toBeGreaterThan(a.createdAt);
    });

    it('génère des tokens distincts', () => {
      const a1 = store.createAttempt();
      const a2 = store.createAttempt();
      expect(a1.authToken).not.toBe(a2.authToken);
    });
  });

  describe('getAttempt()', () => {
    it('renvoie null pour un token inexistant', () => {
      expect(store.getAttempt('nope')).toBeNull();
    });

    it('renvoie l\'attempt existant', () => {
      const { authToken } = store.createAttempt();
      const found = store.getAttempt(authToken);
      expect(found.authToken).toBe(authToken);
    });

    it('renvoie status="expired" si TTL dépassé et purge', () => {
      const { authToken } = store.createAttempt();
      jest.advanceTimersByTime(11 * 60 * 1000); // > 10 min
      const found = store.getAttempt(authToken);
      expect(found).toEqual({ authToken, status: 'expired' });
      expect(store.getAttempt(authToken)).toBeNull();
    });
  });

  describe('markSucceeded()', () => {
    it('attache le steamId et renvoie true', () => {
      const { authToken } = store.createAttempt();
      expect(store.markSucceeded(authToken, '76561197960287930')).toBe(true);
      expect(store.getAttempt(authToken).steamId).toBe('76561197960287930');
    });

    it('renvoie false pour un token inexistant', () => {
      expect(store.markSucceeded('nope', '76561197960287930')).toBe(false);
    });

    it('renvoie false et purge si expiré', () => {
      const { authToken } = store.createAttempt();
      jest.advanceTimersByTime(11 * 60 * 1000);
      expect(store.markSucceeded(authToken, '76561197960287930')).toBe(false);
      expect(store.getAttempt(authToken)).toBeNull();
    });
  });
});
