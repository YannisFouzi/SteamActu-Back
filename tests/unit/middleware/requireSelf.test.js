const requireSelf = require('../../../src/middleware/requireSelf');
const { mockRequest, mockResponse, mockNext } = require('../../helpers/expressMocks');

describe('middleware/requireSelf', () => {
  const SESSION_STEAM_ID = '76561197960287930';

  function makeReq(overrides = {}) {
    return mockRequest({
      mobileSession: { steamId: SESSION_STEAM_ID, v: 1, iat: 0, exp: 0 },
      ...overrides,
    });
  }

  it('500 si mobileSession absent (middleware mal monté)', () => {
    const req = mockRequest({ params: { steamId: SESSION_STEAM_ID } });
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  it('400 si aucun steamId cible (params/query/body vides)', () => {
    const req = makeReq();
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 si params.steamId != session.steamId', () => {
    const req = makeReq({ params: { steamId: '76561197960288888' } });
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 si query.steamId != session.steamId', () => {
    const req = makeReq({ query: { steamId: '76561197960288888' } });
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('403 si body.steamId != session.steamId', () => {
    const req = makeReq({ body: { steamId: '76561197960288888' } });
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('next() si params.steamId == session.steamId', () => {
    const req = makeReq({ params: { steamId: SESSION_STEAM_ID } });
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('next() si query.steamId == session.steamId', () => {
    const req = makeReq({ query: { steamId: SESSION_STEAM_ID } });
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('next() si body.steamId == session.steamId', () => {
    const req = makeReq({ body: { steamId: SESSION_STEAM_ID } });
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('params prioritaire sur query et body', () => {
    const req = makeReq({
      params: { steamId: SESSION_STEAM_ID },
      query: { steamId: '76561197960288888' },
      body: { steamId: '76561197960288888' },
    });
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('query prioritaire sur body si params absent', () => {
    const req = makeReq({
      query: { steamId: '76561197960288888' },
      body: { steamId: SESSION_STEAM_ID },
    });
    const res = mockResponse();
    const next = mockNext();
    requireSelf(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
