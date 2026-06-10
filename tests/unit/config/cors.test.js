const { CORS_OPTIONS } = require('../../../src/config/app');

describe('config/app CORS_OPTIONS', () => {
  // Regression guard pour le finding sécurité #3 : `credentials: true` combiné à
  // une origine `*` est invalide (spec CORS) et ouvre un vecteur latent de fuite
  // de cookie cross-origin. L'API étant Bearer-only, credentials DOIT rester off.
  it('n\'active jamais credentials (auth Bearer, pas de cookie cross-origin)', () => {
    expect(CORS_OPTIONS.credentials).toBe(false);
  });

  it('expose une origine définie', () => {
    expect(CORS_OPTIONS.origin).toBeDefined();
  });
});
