function mockRequest(overrides = {}) {
  const headers = overrides.headers || {};
  return {
    method: 'GET',
    originalUrl: '/test',
    path: '/test',
    params: {},
    query: {},
    body: {},
    cookies: {},
    signedCookies: {},
    get: jest.fn((name) => headers[name.toLowerCase()]),
    ...overrides,
    headers,
  };
}

function mockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
}

function mockNext() {
  return jest.fn();
}

module.exports = { mockRequest, mockResponse, mockNext };
