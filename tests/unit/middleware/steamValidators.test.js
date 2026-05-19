const {
  isValidSteamId,
  isValidAppId,
  validateSteamId,
  validateBodySteamId,
  validateAppId,
  clampQueryInt,
} = require('../../../src/middleware/steamValidators');
const { mockRequest, mockResponse, mockNext } = require('../../helpers/expressMocks');

describe('middleware/steamValidators', () => {
  describe('isValidSteamId()', () => {
    it('accepte exactement 17 chiffres', () => {
      expect(isValidSteamId('76561197960287930')).toBe(true);
    });

    it('rejette 16 ou 18 chiffres', () => {
      expect(isValidSteamId('7656119796028793')).toBe(false);
      expect(isValidSteamId('765611979602879300')).toBe(false);
    });

    it('rejette lettres, espaces, caractères spéciaux', () => {
      expect(isValidSteamId('7656119796028793a')).toBe(false);
      expect(isValidSteamId('76561197960287 30')).toBe(false);
      expect(isValidSteamId('765611979602-7930')).toBe(false);
    });

    it('rejette vide, null, undefined, number', () => {
      expect(isValidSteamId('')).toBe(false);
      expect(isValidSteamId(null)).toBe(false);
      expect(isValidSteamId(undefined)).toBe(false);
      expect(isValidSteamId(76561197960287930)).toBe(false);
    });
  });

  describe('isValidAppId()', () => {
    it('accepte un entier positif (string)', () => {
      expect(isValidAppId('730')).toBe(true);
      expect(isValidAppId('1')).toBe(true);
      expect(isValidAppId('999999999')).toBe(true);
    });

    it('rejette 0, négatif, décimal, lettres, vide', () => {
      expect(isValidAppId('0')).toBe(false);
      expect(isValidAppId('-1')).toBe(false);
      expect(isValidAppId('1.5')).toBe(false);
      expect(isValidAppId('abc')).toBe(false);
      expect(isValidAppId('')).toBe(false);
      expect(isValidAppId(null)).toBe(false);
      expect(isValidAppId(730)).toBe(false);
    });
  });

  describe('validateSteamId middleware', () => {
    it('appelle next() si steamId valide en params', () => {
      const req = mockRequest({ params: { steamId: '76561197960287930' } });
      const res = mockResponse();
      const next = mockNext();
      validateSteamId(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('renvoie 400 si steamId invalide', () => {
      const req = mockRequest({ params: { steamId: 'abc' } });
      const res = mockResponse();
      const next = mockNext();
      validateSteamId(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'SteamID invalide' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validateBodySteamId middleware', () => {
    it('appelle next() si body.steamId valide', () => {
      const req = mockRequest({ body: { steamId: '76561197960287930' } });
      const res = mockResponse();
      const next = mockNext();
      validateBodySteamId(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('renvoie 400 si body absent', () => {
      const req = mockRequest({ body: undefined });
      const res = mockResponse();
      const next = mockNext();
      validateBodySteamId(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('validateAppId middleware', () => {
    it('appelle next() si appId valide', () => {
      const req = mockRequest({ params: { appId: '730' } });
      const res = mockResponse();
      const next = mockNext();
      validateAppId(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('renvoie 400 si appId = 0', () => {
      const req = mockRequest({ params: { appId: '0' } });
      const res = mockResponse();
      const next = mockNext();
      validateAppId(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('clampQueryInt()', () => {
    it('renvoie default si undefined, null ou vide', () => {
      expect(clampQueryInt(undefined, 10, 1, 100)).toBe(10);
      expect(clampQueryInt(null, 10, 1, 100)).toBe(10);
      expect(clampQueryInt('', 10, 1, 100)).toBe(10);
    });

    it('renvoie default si non parseable', () => {
      expect(clampQueryInt('abc', 10, 1, 100)).toBe(10);
    });

    it('clamp dans [min, max]', () => {
      expect(clampQueryInt('5', 10, 1, 100)).toBe(5);
      expect(clampQueryInt('0', 10, 1, 100)).toBe(1);
      expect(clampQueryInt('999', 10, 1, 100)).toBe(100);
      expect(clampQueryInt('-50', 10, 1, 100)).toBe(1);
    });

    it('parse une string avec partie décimale (parseInt)', () => {
      expect(clampQueryInt('7.9', 10, 1, 100)).toBe(7);
    });
  });
});
