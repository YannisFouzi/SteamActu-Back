const serviceMock = {
  normalizeFeedbackPayload: jest.fn(),
  sendFeedbackMail: jest.fn(),
};

jest.doMock('../../../src/services/feedbackMailService', () => serviceMock);

const request = require('supertest');
const { createTestApp } = require('../../helpers/createTestApp');

const app = createTestApp({ mount: ['feedback'] });

describe('routes /api/feedback', () => {
  beforeEach(() => {
    serviceMock.normalizeFeedbackPayload.mockReset();
    serviceMock.sendFeedbackMail.mockReset();
  });

  it('renvoie le statusCode du service si payload invalide', async () => {
    serviceMock.normalizeFeedbackPayload.mockReturnValue({
      ok: false,
      statusCode: 400,
      message: 'type invalide',
    });

    const r = await request(app).post('/api/feedback').send({ foo: 'bar' });
    expect(r.status).toBe(400);
    expect(r.body).toEqual({ message: 'type invalide' });
    expect(serviceMock.sendFeedbackMail).not.toHaveBeenCalled();
  });

  it('default statusCode=400 si non fourni', async () => {
    serviceMock.normalizeFeedbackPayload.mockReturnValue({
      ok: false,
      message: 'x',
    });
    const r = await request(app).post('/api/feedback').send({});
    expect(r.status).toBe(400);
  });

  it('202 + { delivered } si payload OK', async () => {
    serviceMock.normalizeFeedbackPayload.mockReturnValue({
      ok: true,
      feedback: { type: 'bug', message: 'hi', email: 'a@b.fr' },
    });
    serviceMock.sendFeedbackMail.mockResolvedValueOnce({ delivered: true });

    const r = await request(app)
      .post('/api/feedback')
      .send({ type: 'bug', message: 'hi', email: 'a@b.fr' });

    expect(r.status).toBe(202);
    expect(r.body).toEqual({ message: 'Feedback envoye', delivered: true });
    expect(serviceMock.sendFeedbackMail).toHaveBeenCalledWith({
      type: 'bug',
      message: 'hi',
      email: 'a@b.fr',
    });
  });

  it('propage les erreurs du service au errorHandler (status custom)', async () => {
    serviceMock.normalizeFeedbackPayload.mockReturnValue({
      ok: true,
      feedback: { type: 'bug', message: 'x', email: 'a@b.fr' },
    });
    const err = Object.assign(new Error('resend down'), { status: 502 });
    serviceMock.sendFeedbackMail.mockRejectedValueOnce(err);

    const r = await request(app).post('/api/feedback').send({});
    expect(r.status).toBe(502);
  });
});
