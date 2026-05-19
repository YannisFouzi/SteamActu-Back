const GameSubscription = require('../../../src/models/GameSubscription');
const { createGameSubscription } = require('../../helpers/factories');

describe('Model GameSubscription', () => {
  describe('validation', () => {
    it('exige gameId et name', async () => {
      const sub = new GameSubscription({});
      await expect(sub.validate()).rejects.toThrow();
    });

    it('crée avec defaults attendus', async () => {
      const sub = await createGameSubscription({ gameId: '730', name: 'CSGO' });
      expect(sub.imageUrl).toBe('');
      expect(sub.subscribers).toEqual([]);
      expect(sub.lastNewsTimestamp).toBe(0);
      expect(sub.lastNewsCheck).toBeNull();
      expect(sub.nextNewsCheckAt).toBeNull();
      expect(sub.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('contraintes Mongo', () => {
    it('gameId est unique', async () => {
      await createGameSubscription({ gameId: '730', name: 'CSGO' });
      await expect(
        createGameSubscription({ gameId: '730', name: 'CSGO bis' }),
      ).rejects.toThrow();
    });

    it('expose les indexes pour rotation (lastNewsCheck) et polling (nextNewsCheckAt)', () => {
      const idx = GameSubscription.schema.indexes();
      const fields = idx.map(([f]) => Object.keys(f)[0]);
      expect(fields).toEqual(
        expect.arrayContaining(['lastNewsCheck', 'nextNewsCheckAt']),
      );
    });
  });

  describe('hook pre-save', () => {
    it('met à jour updatedAt à chaque save', async () => {
      const sub = await createGameSubscription({ gameId: '730', name: 'CSGO' });
      const initial = sub.updatedAt.getTime();
      await new Promise((r) => setTimeout(r, 10));
      sub.name = 'CSGO 2';
      await sub.save();
      expect(sub.updatedAt.getTime()).toBeGreaterThan(initial);
    });
  });

  describe('subscribers', () => {
    it('accepte un array de steamIds', async () => {
      const sub = await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        subscribers: ['76561197960287930', '76561197960287931'],
      });
      expect(sub.subscribers).toHaveLength(2);
    });
  });
});
