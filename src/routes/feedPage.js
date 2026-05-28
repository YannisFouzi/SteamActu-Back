const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const {isValidSteamId} = require('../middleware/steamValidators');

const TEMPLATE_PATH = path.join(__dirname, '..', 'views', 'feed.html');

// Read once at module load — the template is small and never changes at runtime.
let cachedTemplate = null;
function loadTemplate() {
  if (cachedTemplate == null) {
    cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  }
  return cachedTemplate;
}

function escapeAttribute(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Public read-only HTML view of a user's news feed. Rendered as a full page
 * inside Steam Desktop via MainWindowBrowserManager.ShowURL from the
 * Millennium plugin, and accessible directly in any browser.
 *
 * Auth model: none — same as admin login page. The data fetched client-side
 * comes from /api/news/feed-by-steamid/:steamId which is also unauthenticated
 * (followed games are public information on steamcommunity.com).
 */
router.get('/feed/:steamId', (req, res) => {
  const {steamId} = req.params;
  const language = typeof req.query.lang === 'string' ? req.query.lang : '';

  if (!isValidSteamId(steamId)) {
    return res.status(400).type('text/plain').send('Invalid SteamID');
  }

  const html = loadTemplate()
    .replace(
      '<html lang="en">',
      `<html lang="${escapeAttribute(language || 'en')}" data-steam-id="${escapeAttribute(steamId)}" data-language="${escapeAttribute(language)}">`,
    );

  res.type('html').send(html);
});

module.exports = router;
