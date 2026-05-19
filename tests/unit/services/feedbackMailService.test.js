const feedbackConfig = {
  toEmail: 'to@example.com',
  fromEmail: 'from@example.com',
  resendApiKey: '',
};
const serverConfig = { NODE_ENV: 'test' };

jest.doMock('../../../src/config/app', () => ({
  FEEDBACK_CONFIG: feedbackConfig,
  SERVER_CONFIG: serverConfig,
}));

const {
  normalizeFeedbackPayload,
  sendFeedbackMail,
} = require('../../../src/services/feedbackMailService');

describe('services/feedbackMailService', () => {
  beforeEach(() => {
    feedbackConfig.resendApiKey = '';
    serverConfig.NODE_ENV = 'test';
    global.fetch = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    delete global.fetch;
  });

  describe('normalizeFeedbackPayload()', () => {
    it('accepte un payload valide complet', () => {
      const r = normalizeFeedbackPayload({
        type: 'bug',
        message: 'Plein de mots ici',
        email: 'user@example.com',
        steamId: '76561197960287930',
      });
      expect(r.ok).toBe(true);
      expect(r.feedback).toMatchObject({
        type: 'bug',
        typeLabel: 'Bug',
        email: 'user@example.com',
        steamId: '76561197960287930',
      });
    });

    it('rejette type invalide', () => {
      expect(
        normalizeFeedbackPayload({ type: 'spam', message: 'aaaaaa', email: 'x@y.fr' }),
      ).toMatchObject({ ok: false, statusCode: 400 });
    });

    it('rejette message trop court', () => {
      expect(
        normalizeFeedbackPayload({ type: 'bug', message: 'hi', email: 'x@y.fr' }).ok,
      ).toBe(false);
    });

    it('rejette message trop long', () => {
      expect(
        normalizeFeedbackPayload({
          type: 'bug',
          message: 'a'.repeat(6000),
          email: 'x@y.fr',
        }).ok,
      ).toBe(false);
    });

    it('rejette email invalide', () => {
      expect(
        normalizeFeedbackPayload({ type: 'bug', message: 'aaaaaa', email: 'no-at' }).ok,
      ).toBe(false);
    });

    it('rejette steamId invalide quand fourni', () => {
      expect(
        normalizeFeedbackPayload({
          type: 'bug',
          message: 'aaaaaa',
          email: 'x@y.fr',
          steamId: 'abc',
        }).ok,
      ).toBe(false);
    });

    it('steamId optionnel → null si vide', () => {
      const r = normalizeFeedbackPayload({
        type: 'feature',
        message: 'aaaaaa',
        email: 'x@y.fr',
      });
      expect(r.ok).toBe(true);
      expect(r.feedback.steamId).toBeNull();
    });

    it('normalise type/email en lowercase et trim', () => {
      const r = normalizeFeedbackPayload({
        type: '  BUG  ',
        message: 'aaaaaa',
        email: '  User@Example.FR  ',
      });
      expect(r.feedback.type).toBe('bug');
      expect(r.feedback.email).toBe('user@example.fr');
    });
  });

  describe('sendFeedbackMail()', () => {
    const feedback = {
      type: 'bug',
      typeLabel: 'Bug',
      message: 'hello world',
      email: 'user@example.com',
      steamId: null,
    };

    it('en dev sans clé Resend : delivered=false devOnly=true', async () => {
      const r = await sendFeedbackMail(feedback);
      expect(r).toEqual({ delivered: false, devOnly: true });
    });

    it('en prod sans clé Resend : throw avec status=503', async () => {
      serverConfig.NODE_ENV = 'production';
      await expect(sendFeedbackMail(feedback)).rejects.toMatchObject({
        message: /RESEND_API_KEY/,
        status: 503,
      });
    });

    it('avec clé Resend : POST + renvoie { delivered:true, messageId }', async () => {
      feedbackConfig.resendApiKey = 'resend-key';
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'msg-123' }),
      });

      const r = await sendFeedbackMail(feedback);
      expect(r).toEqual({ delivered: true, messageId: 'msg-123' });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer resend-key',
          }),
        }),
      );
    });

    it('Resend 4xx → throw avec status=400', async () => {
      feedbackConfig.resendApiKey = 'k';
      global.fetch.mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => 'bad req',
      });
      await expect(sendFeedbackMail(feedback)).rejects.toMatchObject({ status: 400 });
    });

    it('Resend 5xx → throw avec status=502', async () => {
      feedbackConfig.resendApiKey = 'k';
      global.fetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'down',
      });
      await expect(sendFeedbackMail(feedback)).rejects.toMatchObject({ status: 502 });
    });

    it('escape HTML du message', async () => {
      feedbackConfig.resendApiKey = 'k';
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      await sendFeedbackMail({
        ...feedback,
        message: '<script>alert(1)</script>',
      });
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.html).not.toContain('<script>');
      expect(body.html).toContain('&lt;script&gt;');
    });
  });
});
