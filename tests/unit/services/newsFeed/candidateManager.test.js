const {
  createCandidateManager,
  addSubscriptionCandidates,
} = require('../../../../src/services/newsFeed/candidateManager');
const { createGameSubscription } = require('../../../helpers/factories');

describe('services/newsFeed/candidateManager', () => {
  describe('createCandidateManager()', () => {
    it('dédup par appId : 2e push ignoré', () => {
      const { candidateMap, pushCandidate } = createCandidateManager();
      pushCandidate('730', 'CSGO', 'subscription', 'img1');
      pushCandidate('730', 'CSGO 2', 'library', 'img2');
      expect(candidateMap.size).toBe(1);
      expect(candidateMap.get('730').name).toBe('CSGO');
      expect(candidateMap.get('730').imageUrl).toBe('img1');
    });

    it('coerce appId en string', () => {
      const { candidateMap, pushCandidate } = createCandidateManager();
      pushCandidate(730, 'CSGO', 'subscription');
      expect([...candidateMap.keys()]).toEqual(['730']);
    });

    it('default name "Jeu {appId}" si name absent', () => {
      const { candidateMap, pushCandidate } = createCandidateManager();
      pushCandidate('730', null, 'subscription');
      expect(candidateMap.get('730').name).toBe('Jeu 730');
    });

    it('imageUrl à null par défaut', () => {
      const { candidateMap, pushCandidate } = createCandidateManager();
      pushCandidate('730', 'CSGO', 'subscription');
      expect(candidateMap.get('730').imageUrl).toBeNull();
    });

    it('ignore appId falsy (null/undefined/empty)', () => {
      const { candidateMap, pushCandidate } = createCandidateManager();
      pushCandidate(null, 'A', 's');
      pushCandidate(undefined, 'B', 's');
      pushCandidate('', 'C', 's');
      pushCandidate(0, 'D', 's');
      expect(candidateMap.size).toBe(0);
    });
  });

  describe('addSubscriptionCandidates()', () => {
    it('retourne false si followedSet vide (early exit)', async () => {
      const pushCandidate = jest.fn();
      const result = await addSubscriptionCandidates(pushCandidate, new Set());
      expect(result).toBe(false);
      expect(pushCandidate).not.toHaveBeenCalled();
    });

    it('charge les GameSubscription correspondantes et appelle pushCandidate', async () => {
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        imageUrl: 'https://logo.example/730.jpg',
      });
      await createGameSubscription({
        gameId: '570',
        name: 'Dota',
        imageUrl: '',
      });

      const pushCandidate = jest.fn();
      const result = await addSubscriptionCandidates(
        pushCandidate,
        new Set(['730', '570']),
      );

      expect(result).toBe(true);
      expect(pushCandidate).toHaveBeenCalledTimes(2);
      const calls = pushCandidate.mock.calls.map((c) => ({
        appId: c[0],
        name: c[1],
        source: c[2],
        imageUrl: c[3],
      }));
      const byId = Object.fromEntries(calls.map((c) => [c.appId, c]));
      expect(byId['730']).toMatchObject({
        name: 'CSGO',
        source: 'subscription',
        imageUrl: 'https://logo.example/730.jpg',
      });
      expect(byId['570'].name).toBe('Dota');
    });

    it('ignore les subs sans gameId', async () => {
      // edge case : aucun match
      const pushCandidate = jest.fn();
      const result = await addSubscriptionCandidates(
        pushCandidate,
        new Set(['99999']),
      );
      expect(result).toBe(true);
      expect(pushCandidate).not.toHaveBeenCalled();
    });
  });
});
