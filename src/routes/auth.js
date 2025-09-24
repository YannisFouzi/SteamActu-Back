/**
 * Routes d'authentification Steam
 * Gère le processus d'authentification OpenID Steam
 */

const express = require("express");
const router = express.Router();

const steamService = require("../services/steamService");
const {
  validateOpenIdResponse,
  extractSteamId,
} = require("../middleware/auth");
const {
  SECURITY_CONFIG,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} = require("../config/app");

/**
 * Route de callback d'authentification Steam
 * Traite la réponse OpenID et redirige vers l'application mobile
 */
router.get("/steam/return", validateOpenIdResponse, async (req, res) => {
  try {
    // Extraire le SteamID de la réponse OpenID
    const identity = req.query["openid.identity"];
    const steamId = extractSteamId(identity);

    if (!steamId) {
      return res.status(400).json({
        error: ERROR_MESSAGES.STEAMID_NOT_FOUND,
      });
    }

    // Enregistrer ou mettre à jour l'utilisateur
    try {
      await steamService.registerOrUpdateUser(steamId);
      console.log(SUCCESS_MESSAGES.USER_AUTHENTICATED(steamId));
    } catch (error) {
      console.error(ERROR_MESSAGES.USER_REGISTRATION_ERROR, error);
      // On continue malgré l'erreur d'enregistrement
    }

    // Rediriger vers l'application mobile avec le SteamID
    const redirectUrl = `${SECURITY_CONFIG.MOBILE_REDIRECT_SCHEME}://auth?steamId=${steamId}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Erreur lors de l'authentification Steam:", error);
    res.status(500).json({
      error: ERROR_MESSAGES.AUTH_ERROR,
    });
  }
});

module.exports = router;
