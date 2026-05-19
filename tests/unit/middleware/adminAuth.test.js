const express = require('express');
const cookieParser = require('cookie-parser');
const signature = require('cookie-signature');
const request = require('supertest');

const SECRET = 'b'.repeat(64);
const TOKEN = 'a'.repeat(64);
const OTHER_TOKEN = 'c'.repeat(64);

const securityState = {
  ADMIN_TOKEN: TOKEN,
  ADMIN_PASSWORD_HASH: 'somehash',
  ADMIN_SESSION_SECRET: SECRET,
  ADMIN_SESSION_MAX_AGE_MS: 24 * 60 * 60 * 1000,
};

jest.doMock('../../../src/config/app', () => ({
  SECURITY_CONFIG: securityState,
}));

const adminAuth = require('../../../src/middleware/adminAuth');
const { mockRequest, mockResponse, mockNext } = require('../../helpers/expressMocks');

function buildSignedAdminApp() {
  const app = express();
  app.use(cookieParser(SECRET));
  app.get('/admin/x', adminAuth, (req, res) => res.json({ ok: true }));
  return app;
}

function buildSignedCookieHeader(rawValue, secret = SECRET) {
  const signed = `s:${signature.sign(rawValue, secret)}`;
  return `admin_session=${encodeURIComponent(signed)}`;
}

describe('middleware/adminAuth', () => {
  beforeEach(() => {
    securityState.ADMIN_TOKEN = TOKEN;
    securityState.ADMIN_PASSWORD_HASH = 'somehash';
    securityState.ADMIN_SESSION_SECRET = SECRET;
  });

  describe('configuration absente', () => {
    it('renvoie 503 si ni ADMIN_TOKEN ni couple (PASSWORD_HASH + SESSION_SECRET)', () => {
      securityState.ADMIN_TOKEN = '';
      securityState.ADMIN_PASSWORD_HASH = '';
      securityState.ADMIN_SESSION_SECRET = '';

      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      adminAuth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });

    it('accepte si seul ADMIN_TOKEN est défini', () => {
      securityState.ADMIN_PASSWORD_HASH = '';
      securityState.ADMIN_SESSION_SECRET = '';

      const req = mockRequest({
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      const res = mockResponse();
      const next = mockNext();
      adminAuth(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe('Bearer token', () => {
    it('appelle next() si Bearer correspond à ADMIN_TOKEN', () => {
      const req = mockRequest({
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      const res = mockResponse();
      const next = mockNext();
      adminAuth(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('renvoie 401 si Bearer ne correspond pas', () => {
      const req = mockRequest({
        headers: { authorization: `Bearer ${OTHER_TOKEN}` },
      });
      const res = mockResponse();
      const next = mockNext();
      adminAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('renvoie 401 si Bearer plus court (taille différente)', () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer short' },
      });
      const res = mockResponse();
      const next = mockNext();
      adminAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('renvoie 401 si header absent', () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      adminAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('renvoie 401 si header sans préfixe Bearer', () => {
      const req = mockRequest({
        headers: { authorization: TOKEN },
      });
      const res = mockResponse();
      const next = mockNext();
      adminAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('renvoie 401 si Bearer vide', () => {
      const req = mockRequest({
        headers: { authorization: 'Bearer    ' },
      });
      const res = mockResponse();
      const next = mockNext();
      adminAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Cookie session signé (via Express + cookie-parser)', () => {
    it('accepte un cookie signé valide non expiré', async () => {
      const app = buildSignedAdminApp();
      const value = `${Date.now()}.${60 * 60 * 1000}`;
      const r = await request(app)
        .get('/admin/x')
        .set('Cookie', buildSignedCookieHeader(value));
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ ok: true });
    });

    it('refuse un cookie expiré', async () => {
      const app = buildSignedAdminApp();
      const expiredIssuedAt = Date.now() - 48 * 60 * 60 * 1000;
      const value = `${expiredIssuedAt}.${60 * 60 * 1000}`;
      const r = await request(app)
        .get('/admin/x')
        .set('Cookie', buildSignedCookieHeader(value));
      expect(r.status).toBe(401);
    });

    it('refuse un cookie signé avec un mauvais secret', async () => {
      const app = buildSignedAdminApp();
      const value = `${Date.now()}.${60 * 60 * 1000}`;
      const r = await request(app)
        .get('/admin/x')
        .set('Cookie', buildSignedCookieHeader(value, 'wrong-secret'));
      expect(r.status).toBe(401);
    });

    it('refuse un cookie au format invalide (issuedAt non numérique)', async () => {
      const app = buildSignedAdminApp();
      const value = 'not-numeric.value';
      const r = await request(app)
        .get('/admin/x')
        .set('Cookie', buildSignedCookieHeader(value));
      expect(r.status).toBe(401);
    });
  });

  it('expose la constante SESSION_COOKIE', () => {
    expect(adminAuth.SESSION_COOKIE).toBe('admin_session');
  });
});
