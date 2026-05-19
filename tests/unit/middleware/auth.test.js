jest.mock('axios');

const axios = require('axios');

const {
  validateOpenIdResponse,
  extractSteamId,
} = require('../../../src/middleware/auth');
const { mockRequest, mockResponse, mockNext } = require('../../helpers/expressMocks');

describe('middleware/auth', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('extractSteamId()', () => {
    it('extrait le steamId d\'une URL OpenID Steam valide', () => {
      const url = 'https://steamcommunity.com/openid/id/76561197960287930';
      expect(extractSteamId(url)).toBe('76561197960287930');
    });

    it('retourne null si format inattendu', () => {
      expect(extractSteamId('https://steamcommunity.com/openid/id/abc')).toBeNull();
      expect(extractSteamId('https://example.com/foo')).toBeNull();
      expect(extractSteamId('')).toBeNull();
    });
  });

  describe('validateOpenIdResponse middleware', () => {
    function buildOpenIdQuery(overrides = {}) {
      return {
        'openid.identity':
          'https://steamcommunity.com/openid/id/76561197960287930',
        'openid.claimed_id':
          'https://steamcommunity.com/openid/id/76561197960287930',
        'openid.sig': 'sig-value',
        'openid.signed': 'mode,identity,claimed_id',
        'openid.mode': 'id_res',
        ...overrides,
      };
    }

    it('renvoie 400 si openid.identity manquant', async () => {
      const req = mockRequest({ query: buildOpenIdQuery({ 'openid.identity': undefined }) });
      const res = mockResponse();
      const next = mockNext();
      await validateOpenIdResponse(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('renvoie 400 si openid.sig manquant', async () => {
      const req = mockRequest({ query: buildOpenIdQuery({ 'openid.sig': undefined }) });
      const res = mockResponse();
      const next = mockNext();
      await validateOpenIdResponse(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('renvoie 400 si openid.identity ne pointe pas vers steamcommunity.com', async () => {
      const req = mockRequest({
        query: buildOpenIdQuery({
          'openid.identity': 'https://evil.com/openid/id/76561197960287930',
        }),
      });
      const res = mockResponse();
      const next = mockNext();
      await validateOpenIdResponse(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('appelle next() si Steam confirme la signature', async () => {
      axios.post.mockResolvedValue({ data: 'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n' });
      const req = mockRequest({ query: buildOpenIdQuery() });
      const res = mockResponse();
      const next = mockNext();

      await validateOpenIdResponse(req, res, next);

      expect(axios.post).toHaveBeenCalledWith(
        'https://steamcommunity.com/openid/login',
        expect.stringContaining('openid.mode=check_authentication'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        }),
      );
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('renvoie 403 si Steam rejette la signature', async () => {
      axios.post.mockResolvedValue({ data: 'is_valid:false' });
      const req = mockRequest({ query: buildOpenIdQuery() });
      const res = mockResponse();
      const next = mockNext();

      await validateOpenIdResponse(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('renvoie 403 si appel Steam échoue (réseau)', async () => {
      axios.post.mockRejectedValue(new Error('network down'));
      const req = mockRequest({ query: buildOpenIdQuery() });
      const res = mockResponse();
      const next = mockNext();

      await validateOpenIdResponse(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('forward openid.mode=check_authentication, écrase id_res', async () => {
      axios.post.mockResolvedValue({ data: 'is_valid:true' });
      const req = mockRequest({ query: buildOpenIdQuery() });
      const res = mockResponse();
      const next = mockNext();

      await validateOpenIdResponse(req, res, next);

      const body = axios.post.mock.calls[0][1];
      expect(body).toContain('openid.mode=check_authentication');
      expect(body).not.toContain('openid.mode=id_res');
    });

    it('ne forward pas les params hors openid.*', async () => {
      axios.post.mockResolvedValue({ data: 'is_valid:true' });
      const req = mockRequest({
        query: { ...buildOpenIdQuery(), foo: 'bar', baz: 'qux' },
      });
      const res = mockResponse();
      const next = mockNext();

      await validateOpenIdResponse(req, res, next);

      const body = axios.post.mock.calls[0][1];
      expect(body).not.toContain('foo=bar');
      expect(body).not.toContain('baz=qux');
    });
  });
});
