const {
  validateUserExists,
  validateActiveGamesFormat,
} = require('../../../src/middleware/userValidators');
const User = require('../../../src/models/User');
const { createUser } = require('../../helpers/factories');
const { mockRequest, mockResponse, mockNext } = require('../../helpers/expressMocks');

describe('middleware/userValidators', () => {
  describe('validateUserExists', () => {
    it('attache req.user et appelle next() si user existe', async () => {
      const user = await createUser({ steamId: '76561197960287930' });
      const req = mockRequest({ params: { steamId: '76561197960287930' } });
      const res = mockResponse();
      const next = mockNext();

      await validateUserExists(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeTruthy();
      expect(req.user.steamId).toBe(user.steamId);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('renvoie 404 si user inexistant', async () => {
      const req = mockRequest({ params: { steamId: '76561197960287999' } });
      const res = mockResponse();
      const next = mockNext();

      await validateUserExists(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Utilisateur non trouvé' });
      expect(next).not.toHaveBeenCalled();
    });

    it('renvoie 500 si la requête Mongo échoue', async () => {
      const findOneSpy = jest
        .spyOn(User, 'findOne')
        .mockRejectedValueOnce(new Error('mongo down'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const req = mockRequest({ params: { steamId: '76561197960287930' } });
      const res = mockResponse();
      const next = mockNext();

      await validateUserExists(req, res, next);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Erreur serveur' });
      expect(next).not.toHaveBeenCalled();

      findOneSpy.mockRestore();
      consoleSpy.mockRestore();
    });
  });

  describe('validateActiveGamesFormat()', () => {
    it('accepte un array', () => {
      expect(validateActiveGamesFormat([])).toBe(true);
      expect(validateActiveGamesFormat([{ appId: '730' }])).toBe(true);
    });

    it('rejette non-array', () => {
      expect(validateActiveGamesFormat(null)).toBe(false);
      expect(validateActiveGamesFormat(undefined)).toBe(false);
      expect(validateActiveGamesFormat({})).toBe(false);
      expect(validateActiveGamesFormat('a')).toBe(false);
    });
  });
});
