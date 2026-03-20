/**
 * Routes d'authentification Steam
 * Gere le processus d'authentification OpenID Steam
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
const {
  createAttempt,
  getAttempt,
  markSucceeded,
} = require("../services/authAttemptStore");

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";

const maskToken = (token) => {
  if (!token || typeof token !== "string") {
    return "(vide)";
  }
  if (token.length <= 8) {
    return "***";
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
};

const maskSteamId = (steamId) => {
  if (!steamId) {
    return "(vide)";
  }

  const value = String(steamId);
  if (value.length <= 6) {
    return value;
  }

  return `${value.slice(0, 3)}***${value.slice(-2)}`;
};

const maskSensitiveUrl = (url) => {
  if (!url) {
    return "(vide)";
  }

  return String(url)
    .replace(
      /(steamId=)([^&#]+)/i,
      (_, prefix, steamId) => `${prefix}${maskSteamId(steamId)}`
    )
    .replace(
      /(authToken=)([^&#]+)/i,
      (_, prefix, token) => `${prefix}${maskToken(token)}`
    );
};

const logAuthServer = (message, payload = null) => {
  if (payload === null || payload === undefined) {
    console.log(`[AUTH] ${message}`);
    return;
  }

  console.log(`[AUTH] ${message}`, JSON.stringify(payload));
};

/**
 * Demarre une tentative d'auth mobile.
 * Le backend construit l'URL OpenID Steam et renvoie un authToken.
 */
router.post("/steam/start", (req, res) => {
  try {
    const attempt = createAttempt();

    // Construire le return_to avec authToken
    const returnTo = `${req.protocol}://${req.get("host")}/auth/steam/return?authToken=${attempt.authToken}`;
    const realm = `${req.protocol}://${req.get("host")}/`;

    const params = new URLSearchParams({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "checkid_setup",
      "openid.identity":
        "http://specs.openid.net/auth/2.0/identifier_select",
      "openid.claimed_id":
        "http://specs.openid.net/auth/2.0/identifier_select",
      "openid.return_to": returnTo,
      "openid.realm": realm,
    });

    const authUrl = `${STEAM_OPENID_URL}?${params.toString()}`;

    logAuthServer("Auth attempt created", {
      authToken: maskToken(attempt.authToken),
      returnTo: maskSensitiveUrl(returnTo),
    });

    res.json({
      authToken: attempt.authToken,
      authUrl,
      expiresAt: new Date(attempt.expiresAt).toISOString(),
    });
  } catch (error) {
    console.error("[AUTH] Erreur creation tentative:", error.message);
    res.status(500).json({ message: "Erreur interne" });
  }
});

/**
 * Verifie le statut d'une tentative d'auth.
 */
router.get("/steam/status/:authToken", (req, res) => {
  const { authToken } = req.params;

  if (!authToken) {
    return res.status(400).json({ message: "authToken requis" });
  }

  const attempt = getAttempt(authToken);

  if (!attempt) {
    return res.json({ status: "expired" });
  }

  if (attempt.status === "expired") {
    return res.json({ status: "expired" });
  }

  if (attempt.steamId) {
    logAuthServer("Auth status check: succeeded", {
      authToken: maskToken(authToken),
      steamId: maskSteamId(attempt.steamId),
    });
    return res.json({
      status: "succeeded",
      steamId: attempt.steamId,
    });
  }

  return res.json({ status: "pending" });
});

/**
 * Callback d'authentification Steam (OpenID return).
 * Modifie pour supporter authToken si present.
 */
router.get("/steam/return", validateOpenIdResponse, async (req, res) => {
  try {
    const authToken = req.query.authToken || null;

    logAuthServer("Callback /auth/steam/return recu", {
      queryKeys: Object.keys(req.query || {}),
      claimedId: req.query["openid.claimed_id"] || null,
      identity: req.query["openid.identity"] || null,
      hasAuthToken: Boolean(authToken),
    });

    // Extraire le SteamID de la reponse OpenID
    const identity = req.query["openid.identity"];
    const steamId = extractSteamId(identity);

    if (!steamId) {
      logAuthServer("SteamID introuvable dans le callback OpenID", {
        identity: identity || null,
      });
      return res.status(400).json({
        message: ERROR_MESSAGES.STEAMID_NOT_FOUND,
      });
    }

    logAuthServer("SteamID extrait depuis OpenID", {
      steamId: maskSteamId(steamId),
      authToken: maskToken(authToken),
    });

    // Enregistrer ou mettre a jour l'utilisateur
    try {
      await steamService.registerOrUpdateUser(steamId);
      console.log(SUCCESS_MESSAGES.USER_AUTHENTICATED(steamId));
    } catch (error) {
      console.error(ERROR_MESSAGES.USER_REGISTRATION_ERROR, error);
      // On continue malgre l'erreur d'enregistrement
    }

    // Si authToken present, marquer la tentative comme reussie
    if (authToken) {
      const marked = markSucceeded(authToken, steamId);
      logAuthServer("Auth attempt marked", {
        authToken: maskToken(authToken),
        steamId: maskSteamId(steamId),
        marked,
      });
    }

    // Rediriger vers l'application mobile
    const redirectUrl = authToken
      ? `${SECURITY_CONFIG.MOBILE_REDIRECT_SCHEME}://auth?steamId=${steamId}&authToken=${authToken}`
      : `${SECURITY_CONFIG.MOBILE_REDIRECT_SCHEME}://auth?steamId=${steamId}`;

    logAuthServer("Redirection vers le deep link mobile", {
      redirectUrl: maskSensitiveUrl(redirectUrl),
    });
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Erreur lors de l'authentification Steam:", error);
    res.status(500).json({
      message: ERROR_MESSAGES.AUTH_ERROR,
    });
  }
});

module.exports = router;
