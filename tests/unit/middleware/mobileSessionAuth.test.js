const securityState = {
  ADMIN_STEAM_IDS: ['76561197960287930'],
};

jest.doMock('../../../src/config/app', () => ({
  SECURITY_CONFIG: securityState,
}));

jest.doMock('../../../src/services/mobileSessionService', () => ({
  verifyMobileSessionToken: jest.fn(),
}));

const {
  isMobileAdminSession,
  mobileSessionAuth,
  requireMobileAdmin,
} = require('../../../src/middleware/mobileSessionAuth');
const {
  verifyMobileSessionToken,
} = require('../../../src/services/mobileSessionService');
const { mockRequest, mockResponse, mockNext } = require('../../helpers/expressMocks');

describe('middleware/mobileSessionAuth', () => {
  describe('mobileSessionAuth()', () => {
    it('renvoie 401 si header absent', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      mobileSessionAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('renvoie 401 si header sans préfixe Bearer', () => {
      const req = mockRequest({ headers: { authorization: 'sometoken' } });
      const res = mockResponse();
      const next = mockNext();
      mobileSessionAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('renvoie 401 si token invalide', () => {
      verifyMobileSessionToken.mockReturnValueOnce(null);
      const req = mockRequest({ headers: { authorization: 'Bearer bad-token' } });
      const res = mockResponse();
      const next = mockNext();
      mobileSessionAuth(req, res, next);
      expect(verifyMobileSessionToken).toHaveBeenCalledWith('bad-token');
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('attache req.mobileSession et appelle next() si token valide', () => {
      const session = { steamId: '76561197960287930', issuedAt: Date.now() };
      verifyMobileSessionToken.mockReturnValueOnce(session);
      const req = mockRequest({
        headers: { authorization: 'Bearer good-token' },
      });
      const res = mockResponse();
      const next = mockNext();

      mobileSessionAuth(req, res, next);

      expect(req.mobileSession).toEqual(session);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('requireMobileAdmin()', () => {
    it('isMobileAdminSession() renvoie true uniquement pour un admin allowliste', () => {
      expect(isMobileAdminSession({ steamId: '76561197960287930' })).toBe(true);
      expect(isMobileAdminSession({ steamId: '76561197960287999' })).toBe(false);
      expect(isMobileAdminSession(null)).toBe(false);
    });

    it('appelle next() si steamId est dans ADMIN_STEAM_IDS', () => {
      const req = mockRequest();
      req.mobileSession = { steamId: '76561197960287930' };
      const res = mockResponse();
      const next = mockNext();
      requireMobileAdmin(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('renvoie 403 si steamId absent ou non admin', () => {
      securityState.ADMIN_STEAM_IDS = ['76561197960287930'];
      const req = mockRequest();
      req.mobileSession = { steamId: '76561197960287999' };
      const res = mockResponse();
      const next = mockNext();
      requireMobileAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('renvoie 403 si req.mobileSession absent', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      requireMobileAdmin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
