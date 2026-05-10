const {
  FEEDBACK_CONFIG,
  SERVER_CONFIG,
} = require('../config/app');
const { isValidSteamId } = require('../middleware/steamValidators');

const RESEND_EMAIL_URL = 'https://api.resend.com/emails';
const VALID_TYPES = new Set(['bug', 'feature']);
const TYPE_LABELS = {
  bug: 'Bug',
  feature: 'Idee',
};
const SUBJECTS = {
  bug: '[Bug Report] Game News',
  feature: '[Feature Request] Game News',
};
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_MIN_LENGTH = 5;
const MESSAGE_MAX_LENGTH = 5000;

function normalizeFeedbackPayload(payload = {}) {
  const type = String(payload.type || '').trim().toLowerCase();
  const message = String(payload.message || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const steamId = String(payload.steamId || '').trim();

  if (!VALID_TYPES.has(type)) {
    return { ok: false, statusCode: 400, message: 'type doit etre bug ou feature' };
  }

  if (message.length < MESSAGE_MIN_LENGTH) {
    return {
      ok: false,
      statusCode: 400,
      message: `message doit contenir au moins ${MESSAGE_MIN_LENGTH} caracteres`,
    };
  }

  if (message.length > MESSAGE_MAX_LENGTH) {
    return {
      ok: false,
      statusCode: 400,
      message: `message doit contenir au maximum ${MESSAGE_MAX_LENGTH} caracteres`,
    };
  }

  if (!EMAIL_REGEX.test(email) || email.length > 254) {
    return { ok: false, statusCode: 400, message: 'email invalide' };
  }

  if (steamId && !isValidSteamId(steamId)) {
    return { ok: false, statusCode: 400, message: 'SteamID invalide' };
  }

  return {
    ok: true,
    feedback: {
      type,
      typeLabel: TYPE_LABELS[type],
      message,
      email,
      steamId: steamId || null,
    },
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildEmailPayload({ feedback }) {
  const sentAt = new Date().toISOString();
  const text = [
    `Type: ${feedback.typeLabel}`,
    `Email: ${feedback.email}`,
    `Date: ${sentAt}`,
    '',
    feedback.message,
  ].join('\n');
  const html = `
    <h2>Game News - ${escapeHtml(feedback.typeLabel)}</h2>
    <p><strong>Email:</strong> ${escapeHtml(feedback.email)}</p>
    <p><strong>Date:</strong> ${escapeHtml(sentAt)}</p>
    <hr />
    <p style="white-space: pre-wrap;">${escapeHtml(feedback.message)}</p>
  `;

  return {
    from: FEEDBACK_CONFIG.fromEmail,
    to: FEEDBACK_CONFIG.toEmail,
    reply_to: feedback.email,
    subject: SUBJECTS[feedback.type],
    text,
    html,
  };
}

async function sendFeedbackMail(feedback) {
  if (!FEEDBACK_CONFIG.resendApiKey) {
    if (SERVER_CONFIG.NODE_ENV === 'production') {
      const error = new Error('RESEND_API_KEY is not configured');
      error.status = 503;
      throw error;
    }

    console.log('[FEEDBACK] RESEND_API_KEY non configure, email non envoye:', {
      type: feedback.type,
      email: feedback.email,
      steamId: feedback.steamId,
      message: feedback.message,
    });
    return { delivered: false, devOnly: true };
  }

  const response = await fetch(RESEND_EMAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FEEDBACK_CONFIG.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildEmailPayload({ feedback })),
  });

  if (!response.ok) {
    const body = await response.text();
    const error = new Error(`Resend email failed (${response.status})`);
    error.status = response.status >= 500 ? 502 : 400;
    error.details = body;
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  return {
    delivered: true,
    messageId: data.id || null,
  };
}

module.exports = {
  normalizeFeedbackPayload,
  sendFeedbackMail,
};
