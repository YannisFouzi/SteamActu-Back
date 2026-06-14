const {
  getPendingFollowPrompts,
  recordFollowPromptCandidates,
} = require('../../../src/services/followPromptService');
const FollowPromptState = require('../../../src/models/FollowPromptState');
const { createUser, createGame, nextSteamId } = require('../../helpers/factories');

describe('services/followPromptService — événementiel', () => {
  describe('recordFollowPromptCandidates', () => {
    it('crée une row "détecté" par jeu nouveau (idempotent)', async () => {
      const steamId = nextSteamId();
      await recordFollowPromptCandidates(steamId, [
        { appId: '730' },
        { appId: '570' },
      ]);
      const rows = await FollowPromptState.find({ steamId }).lean();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => !r.pushedAt && !r.toastedAt)).toBe(true);

      // Idempotent : un 2e enregistrement ne réécrit pas une row déjà livrée.
      await FollowPromptState.updateOne(
        { steamId, appId: '730' },
        { $set: { pushedAt: new Date() } }
      );
      await recordFollowPromptCandidates(steamId, [{ appId: '730' }]);
      const row730 = await FollowPromptState.findOne({
        steamId,
        appId: '730',
      }).lean();
      expect(row730.pushedAt).toBeTruthy(); // pas réinitialisé
    });
  });

  describe('getPendingFollowPrompts', () => {
    it("AUCUN prompt si aucun jeu n'a été détecté comme nouveau (le cas du désuivi)", async () => {
      const steamId = nextSteamId();
      // L'user possède 730 et ne le suit pas — MAIS aucune détection n'a eu lieu
      // (ex. il vient de le désuivre). Aucune row → aucun prompt.
      await createUser({
        steamId,
        followedGames: [],
        gameLibrary: { games: [{ gameId: '730' }], lastFullSync: null },
      });
      const out = await getPendingFollowPrompts(steamId);
      expect(out).toEqual([]);
    });

    it('renvoie un candidat détecté non livré + non suivi, et le marque toastedAt', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: [] });
      await createGame({
        appId: '730',
        name: 'CSGO',
        header_image: 'https://g/730.jpg',
      });
      await recordFollowPromptCandidates(steamId, [{ appId: '730' }]);

      const out = await getPendingFollowPrompts(steamId);
      expect(out).toEqual([
        { appId: '730', name: 'CSGO', logoUrl: 'https://g/730.jpg' },
      ]);

      const row = await FollowPromptState.findOne({
        steamId,
        appId: '730',
      }).lean();
      expect(row.toastedAt).toBeTruthy();
    });

    it('ne re-prompte pas un candidat déjà toasté (desktop) ou poussé (mobile)', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: [] });
      await FollowPromptState.create({
        steamId,
        appId: '730',
        toastedAt: new Date(),
      });
      await FollowPromptState.create({
        steamId,
        appId: '570',
        pushedAt: new Date(),
      });

      const out = await getPendingFollowPrompts(steamId);
      expect(out).toEqual([]);
    });

    it('ne prompte pas un jeu détecté puis suivi entre-temps', async () => {
      const steamId = nextSteamId();
      await createUser({ steamId, followedGames: ['730'] }); // suivi maintenant
      await recordFollowPromptCandidates(steamId, [{ appId: '730' }]);

      const out = await getPendingFollowPrompts(steamId);
      expect(out).toEqual([]);
    });

    it('user inexistant → []', async () => {
      expect(await getPendingFollowPrompts(nextSteamId())).toEqual([]);
    });
  });
});
