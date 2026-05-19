const errorHandler = require('../../../src/middleware/errorHandler');
const { mockRequest, mockResponse, mockNext } = require('../../helpers/expressMocks');

describe('middleware/errorHandler', () => {
  it('renvoie 409 + message pour une erreur duplicate key Mongo (code 11000)', () => {
    const err = Object.assign(new Error('duplicate'), { code: 11000 });
    const req = mockRequest();
    const res = mockResponse();
    errorHandler(err, req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'Ressource déjà existante' });
  });

  it('renvoie 400 + liste de messages pour ValidationError', () => {
    const err = {
      name: 'ValidationError',
      errors: {
        steamId: { message: 'steamId required' },
        language: { message: 'language invalid' },
      },
    };
    const req = mockRequest();
    const res = mockResponse();
    errorHandler(err, req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Données invalides',
      errors: ['steamId required', 'language invalid'],
    });
  });

  it('renvoie le status custom de l\'erreur si fourni', () => {
    const err = Object.assign(new Error('not found'), { status: 404 });
    const req = mockRequest();
    const res = mockResponse();
    errorHandler(err, req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'not found' });
  });

  it('fallback 500 + message générique si rien de spécifique', () => {
    const err = new Error('boom');
    const req = mockRequest();
    const res = mockResponse();
    errorHandler(err, req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'boom' });
  });

  it('fallback 500 + message par défaut si err.message vide', () => {
    const err = { name: 'WeirdError' };
    const req = mockRequest();
    const res = mockResponse();
    errorHandler(err, req, res, mockNext());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Erreur serveur interne' });
  });
});
