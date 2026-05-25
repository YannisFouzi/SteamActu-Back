/**
 * Middleware d'authentification
 * Gere la validation OpenID et l'extraction du SteamID
 */

const axios = require("axios");
const { ERROR_MESSAGES } = require("../config/app");
const logger = require("../utils/logger");

const STEAM_OPENID_URL = "https://steamcommunity.com/openid/login";

/**
 * Verifie la reponse OpenID aupres de Steam (check_authentication).
 * Renvoie true si Steam confirme que la signature est valide.
 */
async function verifySteamOpenIdSignature(query) {
  // Construire les params de verification : memes params que le callback,
  // mais avec openid.mode = check_authentication
  const verifyParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith("openid.")) {
      verifyParams.append(key, value);
    }
  }

  verifyParams.set("openid.mode", "check_authentication");

  try {
    const response = await axios.post(STEAM_OPENID_URL, verifyParams.toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 10000,
    });

    // Steam repond en key-value (pas JSON)
    // Reponse valide : "is_valid:true"
    const body = typeof response.data === "string" ? response.data : String(response.data);
    return body.includes("is_valid:true");
  } catch (error) {
    logger.error({ err: error }, "auth_openid_signature_verify_failed");
    return false;
  }
}

/**
 * Middleware de validation des parametres OpenID.
 * Verifie la presence des champs requis puis confirme la signature aupres de Steam.
 */
const validateOpenIdResponse = async (req, res, next) => {
  const query = req.query;

  if (!query["openid.identity"] || !query["openid.sig"] || !query["openid.signed"]) {
    logger.warn(
      {
        queryKeys: Object.keys(query || {}),
        hasIdentity: Boolean(query["openid.identity"]),
        hasSig: Boolean(query["openid.sig"]),
        hasSigned: Boolean(query["openid.signed"]),
      },
      "auth_openid_callback_missing_fields"
    );
    return res.status(400).json({
      message: ERROR_MESSAGES.INVALID_OPENID,
    });
  }

  // Verifier que claimed_id et identity pointent vers steamcommunity.com
  const identity = query["openid.identity"];
  const claimedId = query["openid.claimed_id"] || "";

  if (
    !identity.startsWith("https://steamcommunity.com/openid/id/") ||
    (claimedId && !claimedId.startsWith("https://steamcommunity.com/openid/id/"))
  ) {
    logger.warn({ identity, claimedId }, "auth_openid_suspect_identity");
    return res.status(400).json({
      message: ERROR_MESSAGES.INVALID_OPENID,
    });
  }

  // Verifier la signature aupres de Steam
  const isValid = await verifySteamOpenIdSignature(query);

  if (!isValid) {
    logger.warn("auth_openid_signature_rejected_by_steam");
    return res.status(403).json({
      message: "Verification OpenID echouee aupres de Steam",
    });
  }

  next();
};

/**
 * Extrait le SteamID de la reponse OpenID
 * @param {string} identity - URL d'identite OpenID
 * @returns {string|null} - SteamID extrait ou null
 */
const extractSteamId = (identity) => {
  const matches = identity.match(/\/id\/(\d+)$/);
  return matches && matches[1] ? matches[1] : null;
};

module.exports = {
  validateOpenIdResponse,
  extractSteamId,
};
