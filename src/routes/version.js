/**
 * Endpoint public exposant la version minimale supportee de l'app mobile.
 *
 * L'app appelle GET /api/version au boot, compare a sa propre version embarquee
 * (frontend/src/config/env.js > APP_VERSION) et affiche un ecran bloquant
 * "Mise a jour requise" si version_locale < minSupportedVersion.
 *
 * Permet d'eviter le scenario "vieil APK qui claque sur un changement breaking
 * du backend" (cas vecu fin mai 2026 avec l'ajout de mobileSessionAuth).
 *
 * Route publique : pas d'auth (l'app non-authentifiee doit pouvoir verifier sa
 * version). Pas de rate-limit fort (apiLimiter applique en amont).
 *
 * Pour bumper le minimum supporte : mettre a jour MIN_SUPPORTED_APP_VERSION
 * ci-dessous OU via variable d'environnement (recommandee en prod pour ne
 * pas avoir a redeployer le code pour pousser un cutoff).
 */

const express = require('express');

const router = express.Router();

const FALLBACK_LATEST = '1.1';
const FALLBACK_MIN = '1.1';

router.get('/', (req, res) => {
  res.json({
    latestVersion: process.env.LATEST_APP_VERSION || FALLBACK_LATEST,
    minSupportedVersion: process.env.MIN_SUPPORTED_APP_VERSION || FALLBACK_MIN,
    updateUrl: process.env.APP_UPDATE_URL || null,
  });
});

module.exports = router;
