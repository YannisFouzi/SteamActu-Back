const {
  buildNotificationSettingsPatch,
  applyNotificationSettingsPatchToUser,
} = require('../../../../src/services/users/userNotificationSettingsService');

describe('services/users/userNotificationSettingsService', () => {
  describe('buildNotificationSettingsPatch()', () => {
    it('renvoie un patch vide si body vide', () => {
      const r = buildNotificationSettingsPatch({});
      expect(r).toEqual({ ok: true, patch: {} });
    });

    it('accepte les valeurs string ("off"|"auto"|"prompt") pour les modes', () => {
      const r = buildNotificationSettingsPatch({
        libraryFollowMode: 'auto',
        wishlistFollowMode: 'prompt',
      });
      expect(r).toEqual({
        ok: true,
        patch: { libraryFollowMode: 'auto', wishlistFollowMode: 'prompt' },
      });
    });

    it('normalise la casse', () => {
      const r = buildNotificationSettingsPatch({ libraryFollowMode: 'AUTO' });
      expect(r.patch.libraryFollowMode).toBe('auto');
    });

    it('rejette une valeur de mode hors enum', () => {
      const r = buildNotificationSettingsPatch({ libraryFollowMode: 'maybe' });
      expect(r.ok).toBe(false);
      expect(r.message).toMatch(/libraryFollowMode/);
    });

    it('coerce boolean vers mode (true→auto, false→off)', () => {
      expect(
        buildNotificationSettingsPatch({ libraryFollowMode: true }).patch
          .libraryFollowMode,
      ).toBe('auto');
      expect(
        buildNotificationSettingsPatch({ libraryFollowMode: false }).patch
          .libraryFollowMode,
      ).toBe('off');
    });

    it('supporte autoFollowNewGames (alias legacy → libraryFollowMode)', () => {
      const r = buildNotificationSettingsPatch({ autoFollowNewGames: true });
      expect(r.patch.libraryFollowMode).toBe('auto');
    });

    it('libraryFollowMode prioritaire sur autoFollowNewGames quand les deux sont fournis', () => {
      const r = buildNotificationSettingsPatch({
        libraryFollowMode: 'prompt',
        autoFollowNewGames: true,
      });
      expect(r.patch.libraryFollowMode).toBe('prompt');
    });

    it('parseOptionalBoolean accepte "true"/"false"/"1"/"0"/"yes"/"no"', () => {
      expect(
        buildNotificationSettingsPatch({ newsNotifications: 'true' }).patch
          .newsNotifications,
      ).toBe(true);
      expect(
        buildNotificationSettingsPatch({ newsNotifications: '0' }).patch
          .newsNotifications,
      ).toBe(false);
      expect(
        buildNotificationSettingsPatch({ newsNotifications: 'no' }).patch
          .newsNotifications,
      ).toBe(false);
    });

    it('rejette les valeurs invalides', () => {
      const r = buildNotificationSettingsPatch({ newsNotifications: 'maybe' });
      expect(r.ok).toBe(false);
    });

    it('legacy "enabled" propage à news + followPrompt si non fournis spécifiquement', () => {
      const r = buildNotificationSettingsPatch({ enabled: true });
      expect(r.patch.newsNotifications).toBe(true);
      expect(r.patch.followPromptNotifications).toBe(true);
    });

    it('newsNotifications spécifique override "enabled"', () => {
      const r = buildNotificationSettingsPatch({
        enabled: true,
        newsNotifications: false,
      });
      expect(r.patch.newsNotifications).toBe(false);
      expect(r.patch.followPromptNotifications).toBe(true);
    });

    it('confirmUnfollowGames boolean OK', () => {
      const r = buildNotificationSettingsPatch({ confirmUnfollowGames: false });
      expect(r.patch.confirmUnfollowGames).toBe(false);
    });

    it('ignore null/undefined sur les champs (ne pollue pas le patch)', () => {
      const r = buildNotificationSettingsPatch({
        newsNotifications: null,
        libraryFollowMode: undefined,
      });
      expect(r.patch).toEqual({});
    });
  });

  describe('applyNotificationSettingsPatchToUser()', () => {
    it('merge le patch dans user.notificationSettings', () => {
      const user = {
        notificationSettings: { newsNotifications: false, libraryFollowMode: 'off' },
      };
      applyNotificationSettingsPatchToUser(user, {
        newsNotifications: true,
        wishlistFollowMode: 'auto',
      });
      expect(user.notificationSettings).toEqual({
        newsNotifications: true,
        libraryFollowMode: 'off',
        wishlistFollowMode: 'auto',
      });
    });

    it('crée notificationSettings si absent', () => {
      const user = {};
      applyNotificationSettingsPatchToUser(user, { newsNotifications: true });
      expect(user.notificationSettings).toEqual({ newsNotifications: true });
    });
  });
});
