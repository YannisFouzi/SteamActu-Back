const providerMock = jest.fn();

jest.doMock('../../../../src/services/notifications/providers', () => ({
  getActiveProvider: () => providerMock,
}));

const {
  sendNotification,
  sendNewsNotification,
  sendFollowPromptNotifications,
} = require('../../../../src/services/notifications/notificationService');
const User = require('../../../../src/models/User');
const GameSubscription = require('../../../../src/models/GameSubscription');
const {
  createUser,
  createGameSubscription,
  nextSteamId,
} = require('../../../helpers/factories');

describe('services/notifications/notificationService', () => {
  beforeEach(() => {
    providerMock.mockReset();
  });

  describe('sendNotification()', () => {
    it('renvoie false si token absent', async () => {
      expect(await sendNotification(null, { title: 'a' })).toBe(false);
      expect(await sendNotification('t', null)).toBe(false);
      expect(providerMock).not.toHaveBeenCalled();
    });

    it('délègue au provider et renvoie son résultat', async () => {
      providerMock.mockResolvedValue(true);
      expect(await sendNotification('t', { title: 'a' })).toBe(true);
      expect(providerMock).toHaveBeenCalledWith('t', { title: 'a' });
    });

    it('renvoie false si le provider throw', async () => {
      providerMock.mockRejectedValue(new Error('boom'));
      expect(await sendNotification('t', { title: 'a' })).toBe(false);
    });
  });

  describe('sendNewsNotification()', () => {
    async function setupUserWithTokens(overrides = {}) {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        notificationSettings: {
          newsNotifications: true,
          followPromptNotifications: false,
          libraryFollowMode: 'off',
          wishlistFollowMode: 'off',
          confirmUnfollowGames: true,
          fcmTokens: [
            { token: 't1', platform: 'android' },
            { token: 't2', platform: 'android' },
          ],
          ...overrides,
        },
      });
      return steamId;
    }

    it('renvoie false si user inexistant', async () => {
      const res = await sendNewsNotification('99999999999999999', '730', 'CSGO', 't', 'u', 'g1');
      expect(res).toBe(false);
      expect(providerMock).not.toHaveBeenCalled();
    });

    it('renvoie false si newsNotifications=false', async () => {
      const steamId = await setupUserWithTokens({ newsNotifications: false });
      const res = await sendNewsNotification(steamId, '730', 'CSGO', 't', 'u', 'g1');
      expect(res).toBe(false);
      expect(providerMock).not.toHaveBeenCalled();
    });

    it('renvoie false si aucun fcmToken', async () => {
      const steamId = await setupUserWithTokens({ fcmTokens: [] });
      const res = await sendNewsNotification(steamId, '730', 'CSGO', 't', 'u', 'g1');
      expect(res).toBe(false);
      expect(providerMock).not.toHaveBeenCalled();
    });

    it('appelle le provider avec tous les tokens et renvoie son résultat', async () => {
      const steamId = await setupUserWithTokens();
      providerMock.mockResolvedValue(true);

      const res = await sendNewsNotification(
        steamId,
        '730',
        'CSGO',
        'Patch',
        'https://x',
        'gid-1',
      );

      expect(res).toBe(true);
      expect(providerMock).toHaveBeenCalledTimes(1);
      const [tokens, notif] = providerMock.mock.calls[0];
      expect(tokens).toEqual(['t1', 't2']);
      expect(notif.title).toBe('CSGO');
      expect(notif.body).toBe('Patch');
      expect(notif.data.type).toBe('news');
    });

    it('inclut gameLogoUrl depuis la GameSubscription si présente', async () => {
      const steamId = await setupUserWithTokens();
      await createGameSubscription({
        gameId: '730',
        name: 'CSGO',
        imageUrl: 'https://logo.example/730.jpg',
        subscribers: [steamId],
      });
      providerMock.mockResolvedValue(true);

      await sendNewsNotification(steamId, '730', 'CSGO', 't', 'u', 'g1');

      const notif = providerMock.mock.calls[0][1];
      expect(notif.data.gameLogoUrl).toBe('https://logo.example/730.jpg');
    });

    it('inclut firstImageUrl si passé', async () => {
      const steamId = await setupUserWithTokens();
      providerMock.mockResolvedValue(true);

      await sendNewsNotification(
        steamId,
        '730',
        'CSGO',
        't',
        'u',
        'g1',
        'https://img.example/1.jpg',
      );

      const notif = providerMock.mock.calls[0][1];
      expect(notif.data.imageUrl).toBe('https://img.example/1.jpg');
    });

    it('nettoie les tokens invalides retournés par le provider', async () => {
      const steamId = await setupUserWithTokens();
      providerMock.mockResolvedValue({ success: true, invalidTokens: ['t1'] });

      const res = await sendNewsNotification(steamId, '730', 'CSGO', 't', 'u', 'g1');

      expect(res).toBe(true);
      const user = await User.findOne({ steamId }).lean();
      const tokens = user.notificationSettings.fcmTokens.map((t) => t.token);
      expect(tokens).toEqual(['t2']);
    });

    it('utilise la langue du user pour le template', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        language: 'en',
        notificationSettings: {
          newsNotifications: true,
          fcmTokens: [{ token: 't1', platform: 'android' }],
        },
      });
      providerMock.mockResolvedValue(true);

      await sendNewsNotification(steamId, '730', null, 't', 'u', 'g1');

      const notif = providerMock.mock.calls[0][1];
      expect(notif.title).toBe('New game update'); // fallback EN
    });

    it('renvoie false si le provider throw', async () => {
      const steamId = await setupUserWithTokens();
      providerMock.mockRejectedValue(new Error('fcm down'));
      expect(await sendNewsNotification(steamId, '730', 'CSGO', 't', 'u', 'g1')).toBe(
        false,
      );
    });
  });

  describe('sendFollowPromptNotifications()', () => {
    async function setupUserWithPrompts() {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        notificationSettings: {
          newsNotifications: false,
          followPromptNotifications: true,
          libraryFollowMode: 'prompt',
          wishlistFollowMode: 'off',
          confirmUnfollowGames: true,
          fcmTokens: [{ token: 't1', platform: 'android' }],
        },
      });
      return steamId;
    }

    it('renvoie 0 si prompts vide ou pas un array', async () => {
      expect(await sendFollowPromptNotifications('any', [])).toBe(0);
      expect(await sendFollowPromptNotifications('any', null)).toBe(0);
    });

    it('renvoie 0 si user inexistant', async () => {
      expect(
        await sendFollowPromptNotifications('99999999999999999', [
          { appId: '730', name: 'CSGO', source: 'library' },
        ]),
      ).toBe(0);
    });

    it('renvoie 0 si followPromptNotifications=false', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        notificationSettings: {
          followPromptNotifications: false,
          fcmTokens: [{ token: 't1', platform: 'android' }],
        },
      });
      expect(
        await sendFollowPromptNotifications(steamId, [
          { appId: '730', name: 'CSGO', source: 'library' },
        ]),
      ).toBe(0);
    });

    it('envoie une notif par prompt et retourne le compteur de succès', async () => {
      const steamId = await setupUserWithPrompts();
      providerMock.mockResolvedValue(true);

      const sent = await sendFollowPromptNotifications(steamId, [
        { appId: '730', name: 'CSGO', source: 'library' },
        { appId: '570', name: 'Dota', source: 'wishlist' },
      ]);

      expect(sent).toBe(2);
      expect(providerMock).toHaveBeenCalledTimes(2);
    });

    it('nettoie les invalidTokens entre prompts (arrête si plus de tokens)', async () => {
      const steamId = await setupUserWithPrompts();
      providerMock
        .mockResolvedValueOnce({ success: true, invalidTokens: ['t1'] })
        .mockResolvedValueOnce(true);

      const sent = await sendFollowPromptNotifications(steamId, [
        { appId: '730', name: 'A', source: 'library' },
        { appId: '570', name: 'B', source: 'library' },
      ]);

      expect(sent).toBe(1); // le 2e n'est pas envoyé car tokens vides
      expect(providerMock).toHaveBeenCalledTimes(1);

      const user = await User.findOne({ steamId }).lean();
      expect(user.notificationSettings.fcmTokens).toEqual([]);
    });

    it('passe imageUrl du prompt dans data', async () => {
      const steamId = await setupUserWithPrompts();
      providerMock.mockResolvedValue(true);

      await sendFollowPromptNotifications(steamId, [
        { appId: '730', name: 'CSGO', source: 'library', imageUrl: 'https://img/1.jpg' },
      ]);

      const notif = providerMock.mock.calls[0][1];
      expect(notif.data.imageUrl).toBe('https://img/1.jpg');
      expect(notif.data.type).toBe('follow_prompt');
    });

    it('renvoie 0 si user.fcmTokens vide', async () => {
      const steamId = nextSteamId();
      await createUser({
        steamId,
        notificationSettings: { followPromptNotifications: true, fcmTokens: [] },
      });
      expect(
        await sendFollowPromptNotifications(steamId, [{ appId: '730', name: 'A' }]),
      ).toBe(0);
    });
  });
});
