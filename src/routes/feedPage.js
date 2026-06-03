const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { isValidSteamId } = require('../middleware/steamValidators');

// Built SPA (backend/web → vite build → src/views/feed-app/).
const SPA_INDEX_PATH = path.join(__dirname, '..', 'views', 'feed-app', 'index.html');

let cachedIndex = null;
function loadIndex() {
  if (cachedIndex == null) {
    cachedIndex = fs.readFileSync(SPA_INDEX_PATH, 'utf8');
  }
  return cachedIndex;
}

// Origins allowed to embed the feed in an <iframe>:
//   - https://steamloopback.host        → the Millennium plugin (Steam Desktop)
//   - store.steampowered.com / steamcommunity.com → the Chrome extension overlay
//     on the Steam website.
const FRAME_ANCESTORS = [
  'https://steamloopback.host',
  'https://store.steampowered.com',
  'https://steamcommunity.com',
].join(' ');

/**
 * Serves the Game News web SPA (Actu / Suivre / Compte tabs), injecting the
 * target SteamID + language so the client doesn't have to parse them.
 * Rendered full-page inside Steam Desktop (Millennium plugin) in an <iframe>,
 * and usable in any browser. No auth — read-only public data keyed by steamId.
 */
router.get('/feed/:steamId', (req, res) => {
  const { steamId } = req.params;
  const language = typeof req.query.lang === 'string' ? req.query.lang : '';

  if (!isValidSteamId(steamId)) {
    return res.status(400).type('text/plain').send('Invalid SteamID');
  }

  // Allow embedding inside the Steam client and the Steam website (extension
  // overlay) only. helmet sets a global `X-Frame-Options: SAMEORIGIN` which would
  // blank the iframe; we scope a relaxation to this read-only page via CSP
  // frame-ancestors. X-Frame-Options must be REMOVED (not just overridden) — when
  // present, browsers honour it even if CSP is more permissive. Mobile/API routes
  // keep helmet's default.
  res.removeHeader('X-Frame-Options');
  res.setHeader(
    'Content-Security-Policy',
    `frame-ancestors 'self' ${FRAME_ANCESTORS}`,
  );

  const injection =
    `<script>window.__GAME_NEWS__=${JSON.stringify({ steamId, language })};</script>`;
  const html = loadIndex().replace('</head>', `${injection}</head>`);

  res.type('html').send(html);
});

module.exports = router;
