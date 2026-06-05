const {
  getPendingFollowPrompts,
} = require('../../../src/services/followPromptService');
const FollowPromptState = require('../../../src/models/FollowPromptState');
const User = require('../../../src/models/User');
const { createUser, createGame, nextSteamId } = require('../../helpers/factories');

function libUser(steamId, gameIds, extra = {}) {
  return createUser({
    steamId,
    notificationSettings: {
      libraryFollowMode: 'prompt',
      wishlistFollowMode: 'off',
      followPromptNotifications: true,
      fcmTokens: [],
    },
    gameLibrary: {
      games: gameIds.map((id) => ({ gameId: String(id) })),
      lastFullSync: null,
    },
    ...extra,
  });
}

describe('services/followPromptService — getPendingFollowPrompts', () => {
  it('1er appel (pas seedé) : seed silencieux — rien renvoyé, tout marqué toastedAt, followPromptSeededAt posé', async () => {
    const steamId = nextSteamId();
    await libUser(steamId, ['730', '570']);

    const out = await getPendingFollowPrompts(steamId);
    expect(out).toEqual([]);

    const rows = await FollowPromptState.find({ steamId }).lean();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.toastedAt)).toBe(true);

    const user = await User.findOne({ steamId }).lean();
    expect(user.followPromptSeededAt).toBeTruthy();
  });

  it('après seed : un jeu non-suivi jamais proposé est renvoyé ET marqué toastedAt', async () => {
    const steamId = nextSteamId();
    await libUser(steamId, ['730'], { followPromptSeededAt: new Date() });
    await createGame({ appId: '730', name: 'CSGO', header_image: 'https://img/730.jpg' });

    const out = await getPendingFollowPrompts(steamId);
    expect(out).toEqual([
      { appId: '730', name: 'CSGO', logoUrl: 'https://img/730.jpg' },
    ]);

    const row = await FollowPromptState.findOne({ steamId, appId: '730' }).lean();
    expect(row.toastedAt).toBeTruthy();
  });

  it('après seed : un jeu déjà poussé sur MOBILE (pushedAt) n\'est PAS re-toasté', async () => {
    const steamId = nextSteamId();
    await libUser(steamId, ['730'], { followPromptSeededAt: new Date() });
    await FollowPromptState.create({ steamId, appId: '730', pushedAt: new Date() });

    const out = await getPendingFollowPrompts(steamId);
    expect(out).toEqual([]);
  });

  it('un jeu déjà suivi n\'est pas candidat', async () => {
    const steamId = nextSteamId();
    await libUser(steamId, ['730'], {
      followPromptSeededAt: new Date(),
      followedGames: ['730'],
    });

    const out = await getPendingFollowPrompts(steamId);
    expect(out).toEqual([]);
  });

  it('libraryFollowMode=off → aucun candidat bibliothèque', async () => {
    const steamId = nextSteamId();
    await createUser({
      steamId,
      notificationSettings: {
        libraryFollowMode: 'off',
        wishlistFollowMode: 'off',
        followPromptNotifications: true,
        fcmTokens: [],
      },
      gameLibrary: { games: [{ gameId: '730' }], lastFullSync: null },
      followPromptSeededAt: new Date(),
    });

    const out = await getPendingFollowPrompts(steamId);
    expect(out).toEqual([]);
  });
});
