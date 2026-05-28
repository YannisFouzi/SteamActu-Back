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

/**
 * Serves the Game News web SPA (Actu / Suivre / Compte tabs), injecting the
 * target SteamID + language so the client doesn't have to parse them.
 * Rendered full-page inside Steam Desktop via MainWindowBrowserManager.ShowURL
 * and usable in any browser. No auth — read-only public data.
 */
router.get('/feed/:steamId', (req, res) => {
  const { steamId } = req.params;
  const language = typeof req.query.lang === 'string' ? req.query.lang : '';

  if (!isValidSteamId(steamId)) {
    return res.status(400).type('text/plain').send('Invalid SteamID');
  }

  const injection =
    `<script>window.__GAME_NEWS__=${JSON.stringify({ steamId, language })};</script>`;
  const html = loadIndex().replace('</head>', `${injection}</head>`);

  res.type('html').send(html);
});

module.exports = router;
