/**
 * Pages legales servies publiquement par le backend :
 *   GET /privacy → politique de confidentialite (HTML)
 *   GET /terms   → conditions d'utilisation (HTML)
 *
 * Exigences Play Store / RGPD :
 *   - Publicly accessible (pas d'auth)
 *   - HTTPS (Railway fournit le TLS)
 *   - Non-PDF (HTML)
 *   - Non-geofenced (CORS open, pas de filtre IP)
 *   - Stable URL (ces 2 paths ne doivent jamais changer une fois soumis sur Play Console)
 *
 * Les HTML sont des fichiers statiques dans backend/src/views/. Pour mettre a
 * jour le contenu :
 *   1. Editer privacy.html / terms.html
 *   2. Mettre a jour `frontend/src/i18n/locales/*.json > legal.documents.{privacy,terms}.updatedAt`
 *      ET les sections en JSON pour que l'app affiche la meme chose
 *   3. Bumper la date "Derniere mise a jour" en tete des deux endroits
 *   4. Deploy backend (Railway auto-deploy sur push main)
 */

const express = require('express');
const path = require('path');

const router = express.Router();

const PRIVACY_HTML = path.join(__dirname, '..', 'views', 'privacy.html');
const TERMS_HTML = path.join(__dirname, '..', 'views', 'terms.html');

// Cache 1h cote client pour soulager le serveur sans rendre les maj trop lentes
const ONE_HOUR_SECONDS = 3600;

router.get('/privacy', (req, res) => {
  res.set('Cache-Control', `public, max-age=${ONE_HOUR_SECONDS}`);
  res.sendFile(PRIVACY_HTML);
});

router.get('/terms', (req, res) => {
  res.set('Cache-Control', `public, max-age=${ONE_HOUR_SECONDS}`);
  res.sendFile(TERMS_HTML);
});

module.exports = router;
