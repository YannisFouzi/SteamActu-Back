const securityState = {
  MOBILE_SESSION_SECRET: 'mobile-secret-key-mobile-secret-key-mobile-secret',
  MOBILE_SESSION_TTL_MS: 30 * 24 * 60 * 60 * 1000,
};

jest.doMock('../../../src/config/app', () => ({
  SECURITY_CONFIG: securityState,
}));

const {
  createMobileSession,
  verifyMobileSessionToken,
} = require('../../../src/services/mobileSessionService');

describe('services/mobileSessionService', () => {
  describe('createMobileSession()', () => {
    it('renvoie { token, expiresAt } pour un steamId valide', () => {
      const session = createMobileSession('76561197960287930');
      expect(session.token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
      expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('lève pour un steamId invalide', () => {
      expect(() => createMobileSession('abc')).toThrow(/SteamID/);
      expect(() => createMobileSession('')).toThrow();
      expect(() => createMobileSession(null)).toThrow();
    });
  });

  describe('verifyMobileSessionToken()', () => {
    it('valide un token fraichement créé', () => {
      const { token } = createMobileSession('76561197960287930');
      const payload = verifyMobileSessionToken(token);
      expect(payload).toMatchObject({
        v: 1,
        steamId: '76561197960287930',
      });
    });

    it('rejette null/undefined/string vide', () => {
      expect(verifyMobileSessionToken(null)).toBeNull();
      expect(verifyMobileSessionToken(undefined)).toBeNull();
      expect(verifyMobileSessionToken('')).toBeNull();
      expect(verifyMobileSessionToken(123)).toBeNull();
    });

    it('rejette un token mal formé (1 partie ou 3+ parties)', () => {
      expect(verifyMobileSessionToken('abc')).toBeNull();
      expect(verifyMobileSessionToken('a.b.c')).toBeNull();
    });

    it('rejette une signature altérée', () => {
      const { token } = createMobileSession('76561197960287930');
      const [payload] = token.split('.');
      expect(verifyMobileSessionToken(`${payload}.WRONGSIG`)).toBeNull();
    });

    it('rejette un payload altéré', () => {
      const { token } = createMobileSession('76561197960287930');
      const [, sig] = token.split('.');
      const fakePayload = Buffer.from(
        JSON.stringify({
          v: 1,
          steamId: '76561197960287999',
          iat: Date.now(),
          exp: Date.now() + 1000,
        }),
        'utf8',
      ).toString('base64url');
      expect(verifyMobileSessionToken(`${fakePayload}.${sig}`)).toBeNull();
    });

    it('rejette un token expiré', () => {
      securityState.MOBILE_SESSION_TTL_MS = -1000; // tokens immédiatement expirés
      const { token } = createMobileSession('76561197960287930');
      expect(verifyMobileSessionToken(token)).toBeNull();
      securityState.MOBILE_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
    });
  });
});
