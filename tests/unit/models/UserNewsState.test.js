const UserNewsState = require('../../../src/models/UserNewsState');
const { createUserNewsState } = require('../../helpers/factories');

describe('Model UserNewsState', () => {
  describe('validation', () => {
    it('exige steamId, appId, newsId, expiresAt', async () => {
      const state = new UserNewsState({});
      const err = await state.validate().catch((e) => e);
      expect(err).toBeTruthy();
      expect(Object.keys(err.errors).sort()).toEqual([
        'appId',
        'expiresAt',
        'newsId',
        'steamId',
      ]);
    });

    it('inFeedAt et pushSentAt par défaut à null', async () => {
      const state = await createUserNewsState();
      expect(state.inFeedAt).toBeNull();
      expect(state.pushSentAt).toBeNull();
    });

    it('timestamps createdAt/updatedAt sont auto-générés', async () => {
      const state = await createUserNewsState();
      expect(state.createdAt).toBeInstanceOf(Date);
      expect(state.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('contraintes Mongo', () => {
    it('clé unique (steamId, appId, newsId) — rejette duplicat', async () => {
      const payload = {
        steamId: '76561197960287930',
        appId: '730',
        newsId: 'news-1',
      };
      await createUserNewsState(payload);
      await expect(createUserNewsState(payload)).rejects.toThrow();
    });

    it('permet (steamId, appId, newsId) différent pour le même user', async () => {
      const base = { steamId: '76561197960287930', appId: '730' };
      await createUserNewsState({ ...base, newsId: 'n1' });
      await expect(
        createUserNewsState({ ...base, newsId: 'n2' }),
      ).resolves.toBeTruthy();
    });

    it('expose l\'index TTL sur expiresAt', () => {
      const idx = UserNewsState.schema.indexes();
      const ttl = idx.find(([key, opts]) =>
        Object.prototype.hasOwnProperty.call(key, 'expiresAt') && opts?.expireAfterSeconds === 0,
      );
      expect(ttl).toBeTruthy();
    });

    it('expose l\'index unique composite (steamId, appId, newsId)', () => {
      const idx = UserNewsState.schema.indexes();
      const compound = idx.find(([key, opts]) =>
        key.steamId === 1 && key.appId === 1 && key.newsId === 1 && opts?.unique === true,
      );
      expect(compound).toBeTruthy();
    });
  });
});
