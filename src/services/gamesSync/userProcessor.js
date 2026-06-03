/**
 * Processeur pour la synchronisation des jeux utilisateur
 *
 * - Mise à jour de gameLibrary.games[] avec la structure normalisée
 * - Création/mise à jour des documents Game en collection séparée
 * - Détection des jeux supprimés et gestion de l'auto-follow
 */

const steamService = require('../steamService');
const Game = require('../../models/Game');
const GameSubscription = require('../../models/GameSubscription');
const { addUserToGameSubscription } = require('../users/subscriptionManager');
const { sendFollowPromptNotifications } = require('../notifications/notificationService');
const { getGameImage } = require('../steamGridDbService');
const { fetchGameDetails } = require('../steam/apiClient');
const {
  getFollowedAppIds,
  buildFollowedGamesEntry,
} = require('../../utils/followedGamesHelpers');
const logger = require('../../utils/logger');

const SYNC_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// Noms qu'on refuse d'écrire en base : placeholders historiques `Xxx <appId>`
// + le cas figé "Unknown Game" qui apparaissait quand Steam ne renvoyait pas
// de nom (typiquement jeu pré-release vu via Family Sharing). Synchronisé
// avec le pattern de subscriptionManager.js pour cohérence.
const PLACEHOLDER_NAME_PATTERN = /^((Test Game|Jeu|Game)\s+\d+|Unknown Game)$/i;

function isUnresolvedName(name) {
  if (!name || typeof name !== 'string') return true;
  const trimmed = name.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_NAME_PATTERN.test(trimmed);
}

/**
 * Pour chaque jeu dont le `name` est manquant/placeholder, tente une
 * résolution via Steam Store appdetails (la même source que la wishlist).
 * Mute `steamGame.name` en place. Les jeux non résolus restent avec leur
 * name vide → upsertGamesCollection les filtrera en aval.
 *
 * @param {Array} steamGames - Jeux à enrichir (mutation en place)
 * @returns {Promise<void>}
 */
async function resolveMissingNames(steamGames) {
  const needsResolution = steamGames.filter((g) => isUnresolvedName(g.name));
  if (needsResolution.length === 0) {
    return;
  }

  logger.info(
    `[NAME-RESOLVER] ${needsResolution.length} jeu(x) sans nom — fallback Steam Store appdetails`
  );

  await Promise.all(
    needsResolution.map(async (game) => {
      const appId = game.appid?.toString();
      if (!appId) return;
      try {
        const details = await fetchGameDetails(appId);
        if (details?.name && !isUnresolvedName(details.name)) {
          logger.info(
            `[NAME-RESOLVER] appId=${appId} → "${details.name}" (résolu via Store)`
          );
          game.name = details.name;
        } else {
          logger.warn(
            `[NAME-RESOLVER] appId=${appId} → introuvable sur Steam Store, sera skip ce run`
          );
        }
      } catch (error) {
        logger.warn(
          `[NAME-RESOLVER] appId=${appId} échec appdetails: ${error.message}`
        );
      }
    })
  );
}

function canSyncUser(user, force = false) {
  if (force) {
    return true;
  }

  const cooldownTime = new Date(Date.now() - SYNC_COOLDOWN_MS);
  const lastSyncTime = user.lastChecked || new Date(0);
  const canSync = lastSyncTime <= cooldownTime;

  logger.info('[SYNC] canSyncUser() - Vérification utilisateur');
  logger.info(`  - lastChecked: ${lastSyncTime.toISOString()}`);
  logger.info(`  - Cooldown expires at: ${cooldownTime.toISOString()}`);
  logger.info(`  - Current time: ${new Date().toISOString()}`);
  logger.info(`  - Can sync: ${canSync ? 'true' : 'false'}`);

  return canSync;
}

function toPositiveNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

function resolveLastPlayedTimestamp(ownedGame, recentlyPlayedGame, previousGame) {
  const candidates = [
    toPositiveNumber(ownedGame?.rtime_last_played),
    toPositiveNumber(recentlyPlayedGame?.rtime_last_played),
    toPositiveNumber(previousGame?.rtime_last_played),
  ].filter(Boolean);

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
}

function hasSteamPlaytimeFields(...games) {
  return games.some((game) => {
    if (!game || typeof game !== 'object') {
      return false;
    }

    return (
      Object.prototype.hasOwnProperty.call(game, 'playtime_forever') ||
      Object.prototype.hasOwnProperty.call(game, 'playtime_2weeks') ||
      Object.prototype.hasOwnProperty.call(game, 'rtime_last_played')
    );
  });
}

function normalizeFollowedGames(user) {
  return new Set(getFollowedAppIds(user));
}

/**
 * Crée/met à jour les documents Game dans la collection Games
 * @param {Array} steamGames - Jeux Steam bruts de l'API
 * @returns {Promise<void>}
 */
async function upsertGamesCollection(steamGames) {
  if (!steamGames || steamGames.length === 0) {
    return;
  }

  // Contrat dur : aucun document Game ne doit contenir un nom placeholder.
  // Si le name reste inutilisable après le resolver, on skip cet appId pour
  // ce run (le prochain sync retentera). Pas d'écriture polluée.
  const resolvedGames = steamGames.filter((g) => !isUnresolvedName(g.name));
  const skippedGames = steamGames.filter((g) => isUnresolvedName(g.name));
  if (skippedGames.length > 0) {
    logger.warn(
      `[NAME-RESOLVER] ${skippedGames.length} jeu(x) sans nom résolvable — SKIP upsert: [${skippedGames
        .map((g) => g.appid)
        .join(', ')}]`
    );
  }
  if (resolvedGames.length === 0) {
    logger.info(`[SYNC] upsertGamesCollection() - Rien à écrire après filtrage`);
    return;
  }

  const startTime = Date.now();
  logger.info(`[SYNC] upsertGamesCollection() - START`);
  logger.info(`  - Jeux à traiter: ${resolvedGames.length}`);

  // Lookup ciblé : on a besoin de connaître les docs existants ET leur
  // name actuel, pour distinguer "nouveau jeu" vs "doc existant à réparer".
  const appIds = resolvedGames.map((g) => g.appid.toString());
  const existingGames = await Game.find({ appId: { $in: appIds } })
    .select('appId name')
    .lean();
  const existingMap = new Map(existingGames.map((g) => [g.appId, g]));

  const bulkOps = [];
  let newCount = 0;
  let healCount = 0;

  for (const steamGame of resolvedGames) {
    const appId = steamGame.appid.toString();
    const existing = existingMap.get(appId);

    if (!existing) {
      newCount++;
      bulkOps.push({
        updateOne: {
          filter: { appId },
          update: {
            $setOnInsert: {
              appId,
              name: steamGame.name,
              img_icon_url: steamGame.img_icon_url || '',
            },
          },
          upsert: true,
        },
      });
    } else if (isUnresolvedName(existing.name)) {
      healCount++;
      logger.info(
        `[NAME-RESOLVER] auto-réparation appId=${appId}: "${existing.name}" → "${steamGame.name}"`
      );
      bulkOps.push({
        updateOne: {
          filter: { appId },
          update: { $set: { name: steamGame.name } },
        },
      });
    }
  }

  if (bulkOps.length === 0) {
    logger.info(
      `[SYNC] upsertGamesCollection() - Aucune écriture nécessaire (${existingMap.size} déjà OK) [OK]`
    );
    return;
  }

  await Game.bulkWrite(bulkOps, { ordered: false });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  logger.info(`[SYNC] upsertGamesCollection() - END`);
  logger.info(`  - Nouveaux: ${newCount} | Auto-réparés: ${healCount}`);
  logger.info(`  - Durée: ${duration}s`);
}

/**
 * Détecte les jeux supprimés de la bibliothèque Steam.
 * Ignore les entrées `isFamilyShared: true` : elles ne sont pas dans
 * GetOwnedGames par construction, donc absentes de `steamGames` — les
 * traiter comme "supprimées" les ferait osciller à chaque sync.
 * @param {Object} user - Utilisateur
 * @param {Array} steamGames - Jeux actuels depuis Steam (owned)
 * @returns {Array} - Liste des appIds supprimés
 */
function detectRemovedGames(user, steamGames) {
  const cachedOwnedGameIds = new Set(
    (user.gameLibrary?.games || [])
      .filter((g) => !g.isFamilyShared)
      .map((g) => g.gameId)
  );
  const steamAppIds = new Set(steamGames.map((g) => g.appid.toString()));

  const removedGameIds = [];
  for (const cachedId of cachedOwnedGameIds) {
    if (!steamAppIds.has(cachedId)) {
      removedGameIds.push(cachedId);
    }
  }

  return removedGameIds;
}

/**
 * Traite l'auto-follow avec mise à jour GameSubscription
 * @param {Object} user - Utilisateur
 * @param {Array} userGames - Jeux Steam
 * @param {Set} followedGamesSet - Jeux suivis
 * @param {Set} cachedGameIds - Jeux déjà en cache
 * @returns {Promise<Object>} - Résultat du traitement
 */
async function processAutoFollow(
  user,
  userGames,
  followedGamesSet,
  cachedGameIds
) {
  const updatedFollowedGames = Array.from(followedGamesSet);
  const newGames = [];
  const followPrompts = [];
  let hasNewFollowedGames = false;

  let followMode = user.notificationSettings?.libraryFollowMode;

  if (!followMode) {
    const legacy = user.notificationSettings?.autoFollowNewGames;
    if (typeof legacy === 'boolean') {
      followMode = legacy ? 'auto' : 'off';
    } else {
      followMode = 'off';
    }
  }

  if (followMode === 'off') {
    return {
      updatedFollowedGames,
      newGames,
      hasNewFollowedGames,
      followPrompts,
    };
  }

  const gamesToHandle = [];

  for (const game of userGames) {
    const appId = game.appid.toString();

    if (!cachedGameIds.has(appId) && !followedGamesSet.has(appId)) {
      // Contrat strict : on n'auto-follow ni n'envoie de prompt pour un jeu
      // sans nom résolu — sinon la notif afficherait "Unknown Game". Le
      // prochain sync (6h max) retentera la résolution.
      if (isUnresolvedName(game.name)) {
        logger.warn(
          `[NAME-RESOLVER] Skip follow appId=${appId} (nom non résolu) — sera retenté au prochain sync`
        );
        continue;
      }
      gamesToHandle.push({
        appId,
        name: game.name,
        source: game.source || 'library',
      });
    }
  }

  if (gamesToHandle.length === 0) {
    return {
      updatedFollowedGames,
      newGames,
      hasNewFollowedGames,
      followPrompts,
    };
  }

  try {
    const games = await Game.find({ appId: { $in: gamesToHandle.map((g) => g.appId) } });
    const gamesMap = new Map(games.map((g) => [g.appId, g]));

    if (followMode === 'auto') {
      for (const entry of gamesToHandle) {
        const { appId } = entry;
        updatedFollowedGames.push(appId);
        hasNewFollowedGames = true;

        const gameDoc = gamesMap.get(appId);
        const gameName = gameDoc?.name || entry.name || `Jeu ${appId}`;
        const imageUrl = gameDoc?.img_icon_url
          ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
          : '';

        newGames.push({
          appId,
          name: gameName,
          action: 'auto-followed',
        });

        await addUserToGameSubscription(appId, user.steamId, gameName, imageUrl);
      }

      logger.info(
        `[OK] ${gamesToHandle.length} GameSubscriptions mises à jour via auto-follow`
      );
    } else if (followMode === 'prompt') {
      // Batch-fetch des imageUrl déjà connues via GameSubscription
      // (même source que NewsTab — cohérence visuelle avec le fil d'actu)
      const subs = await GameSubscription.find({
        gameId: { $in: gamesToHandle.map((g) => g.appId) },
      })
        .select('gameId imageUrl')
        .lean();
      const subsImageMap = new Map(
        subs.map((s) => [s.gameId, s.imageUrl]).filter(([, url]) => Boolean(url))
      );

      for (const entry of gamesToHandle) {
        const { appId, source } = entry;
        const gameDoc = gamesMap.get(appId);
        const gameName = gameDoc?.name || entry.name || `Jeu ${appId}`;

        let imageUrl = subsImageMap.get(appId) || '';
        if (!imageUrl) {
          imageUrl = (await getGameImage(appId, gameName).catch(() => null)) || '';
        }

        newGames.push({
          appId,
          name: gameName,
          action: 'prompt',
        });

        followPrompts.push({
          appId,
          name: gameName,
          imageUrl,
          source: source || 'library',
        });
      }
    }
  } catch (error) {
    logger.error('[ERROR] Erreur traitement follow mode:', error.message);
  }

  return {
    updatedFollowedGames,
    newGames,
    hasNewFollowedGames,
    followPrompts,
  };
}

function createUserResult(user) {
  return {
    userId: user._id,
    steamId: user.steamId,
    updatedGames: [],
    removedGames: [],
    error: null,
    lastSyncTime: new Date(),
  };
}

/**
 * Synchronise les jeux avec nouvelle structure normalisée
 * @param {Object} user - Utilisateur
 * @returns {Promise<Object>} - Résultat de synchronisation
 */
async function syncUserGames(user, options = {}) {
  const { force = false, reason = 'scheduled' } = options;
  const result = createUserResult(user);

  try {
    const startTime = Date.now();
    logger.info(`\n[SYNC] syncUserGames() - START`);
    logger.info(`  - Démarrage de la synchronisation utilisateur`);

    if (!canSyncUser(user, force)) {
      const lastSyncTime = user.lastChecked || new Date(0);
      logger.info(
        `Utilisateur synchronisé récemment (${lastSyncTime.toISOString()}), en attente.`
      );
      logger.info(`[SYNC] syncUserGames() - SKIPPED (cooldown actif)\n`);
      return {
        ...result,
        skipped: true,
        message: 'Synchronisation récente, ignorée',
      };
    }

    logger.info(`[SYNC] Steam API GetOwnedGames + GetRecentlyPlayedGames (reason=${reason}, force=${force})`);

    const [userGames, recentlyPlayedGames] = await Promise.all([
      steamService.getUserGames(user.steamId),
      steamService.getRecentlyPlayedGames(user.steamId).catch((error) => {
        logger.warn(
          '[SYNC] GetRecentlyPlayedGames indisponible, fallback OwnedGames:',
          error?.message || error
        );
        return [];
      }),
    ]);

    if (!userGames || !Array.isArray(userGames)) {
      logger.error(`Réponse invalide de l'API Steam pour un utilisateur`);
      logger.info(`[SYNC] syncUserGames() - ERROR (Invalid Steam response)\n`);
      result.error = "Réponse invalide de l'API Steam";
      return result;
    }

    logger.info(`  - Jeux récupérés: ${userGames.length}`);
    logger.info(`  - Jeux récemment lancés (2 semaines): ${recentlyPlayedGames.length}`);

    // ---- Détection Steam Family ---------------------------------------
    // L'API GetRecentlyPlayedGames renvoie aussi les jeux lancés depuis
    // une Family Library Sharing (non possédés par l'user). On isole ces
    // appIds par diff avec GetOwnedGames.
    const ownedAppIds = new Set(userGames.map((g) => g.appid.toString()));
    const familyGames = (recentlyPlayedGames || []).filter(
      (g) => !ownedAppIds.has(g.appid?.toString())
    );

    const previousLibraryGames = user.gameLibrary?.games || [];
    const previousFamilyIds = new Set(
      previousLibraryGames
        .filter((g) => g.isFamilyShared)
        .map((g) => g.gameId)
    );
    const currentFamilyIds = new Set(
      familyGames.map((g) => g.appid.toString())
    );

    logger.info(`[FAMILY] Analyse diff recentlyPlayed \\ owned`);
    logger.info(`  - Owned: ${userGames.length} | RecentlyPlayed: ${recentlyPlayedGames.length}`);
    logger.info(`  - Family détectés ce run: ${familyGames.length}`);
    if (familyGames.length > 0) {
      for (const fg of familyGames) {
        const wasKnown = previousFamilyIds.has(fg.appid?.toString());
        logger.info(
          `  - [FAMILY]${wasKnown ? ' (déjà connu)' : ' (NOUVEAU)'} appId=${fg.appid} name="${fg.name}" playtime_2weeks=${fg.playtime_2weeks || 0}min rtime_last_played=${fg.rtime_last_played || 'n/a'}`
        );
      }
    }

    // ---- Résolution des noms manquants --------------------------------
    // Steam Web API peut renvoyer un name vide pour les jeux pré-release
    // (cas typique : jeu acheté en accès anticipé partagé via Steam Family
    // avant publication complète de l'appinfo). On enrichit via Steam Store
    // appdetails AVANT d'écrire en base, pour ne jamais persister un
    // placeholder ni déclencher une notif "Unknown Game".
    await resolveMissingNames([...userGames, ...familyGames]);

    // ---- Upsert Games (owned + family) --------------------------------
    // Les Family games ont aussi besoin d'un document Game pour que le
    // frontend puisse résoudre name + header_image via le lazy-loading.
    // upsertGamesCollection skip les jeux dont le nom reste non résolu.
    await upsertGamesCollection([...userGames, ...familyGames]);
    logger.info(
      `[OK] ${userGames.length + familyGames.length} jeux traités pour Games (dont ${familyGames.length} Family)`
    );

    const cachedGameIds = new Set(
      previousLibraryGames.map((g) => g.gameId)
    );

    const removedGameIds = detectRemovedGames(user, userGames);
    if (removedGameIds.length > 0) {
      logger.info(
        `[INFO] ${removedGameIds.length} jeu(x) supprimé(s) de la bibliothèque Steam`
      );
      result.removedGames = removedGameIds;

      const removedSet = new Set(removedGameIds);
      user.followedGames = (user.followedGames || []).filter((entry) => {
        const appId =
          typeof entry === 'string'
            ? entry
            : entry?.appId
            ? String(entry.appId)
            : null;
        return appId && !removedSet.has(appId);
      });
    }

    const followedGamesSet = normalizeFollowedGames(user);

    // Les Family games passent par le même pipeline de follow-prompt que
    // les jeux owned (même setting `libraryFollowMode`), mais on les tague
    // `source: 'family'` pour que la notif utilise un contextLabel dédié
    // ("votre Steam Famille") au lieu de "votre bibliothèque Steam".
    const gamesForAutoFollow = [
      ...userGames.map((g) => ({ ...g, source: 'library' })),
      ...familyGames.map((fg) => ({
        appid: fg.appid,
        name: fg.name,
        source: 'family',
      })),
    ];

    const autoFollowResult = await processAutoFollow(
      user,
      gamesForAutoFollow,
      followedGamesSet,
      cachedGameIds
    );

    const newFamilyIds = [...currentFamilyIds].filter(
      (id) => !previousFamilyIds.has(id)
    );
    if (newFamilyIds.length > 0) {
      logger.info(
        `[FAMILY] ${newFamilyIds.length} nouveau(x) jeu(x) Family déclenchent le pipeline follow_prompt (si mode=prompt)`
      );
    }

    result.updatedGames = autoFollowResult.newGames;
    result.followPrompts = autoFollowResult.followPrompts || [];

    if (autoFollowResult.hasNewFollowedGames) {
      // On part de l'existant pour préserver les followedAt des anciens follows,
      // et on ajoute uniquement les nouveaux appIds avec leur timestamp actuel.
      const existingByAppId = new Map();
      for (const entry of user.followedGames || []) {
        const appId =
          typeof entry === 'string'
            ? entry
            : entry?.appId
            ? String(entry.appId)
            : null;
        if (!appId || existingByAppId.has(appId)) continue;
        existingByAppId.set(
          appId,
          typeof entry === 'string' ? buildFollowedGamesEntry(appId) : entry
        );
      }

      for (const appId of autoFollowResult.updatedFollowedGames) {
        const normalized = String(appId);
        if (!existingByAppId.has(normalized)) {
          existingByAppId.set(normalized, buildFollowedGamesEntry(normalized));
        }
      }

      user.followedGames = Array.from(existingByAppId.values());
      logger.info(
        `[OK] ${result.updatedGames.length} jeux auto-suivis pour un utilisateur`
      );
    }

    const previousLibraryMap = new Map(
      previousLibraryGames.map((g) => [g.gameId, g])
    );

    const recentlyPlayedMap = new Map(
      (recentlyPlayedGames || []).map((g) => [g.appid?.toString(), g])
    );

    // Construction gameLibrary = owned + Family sticky.
    // Family sticky = on conserve les entrées Family déjà connues même
    // absentes du recentlyPlayed actuel (fenêtre 2 semaines), pour qu'un
    // jeu Family ne disparaisse pas de l'onglet "Récents" dès que l'user
    // cesse d'y jouer.
    const libraryGames = userGames.map((g) => {
      const gameId = g.appid.toString();
      const previousGame = previousLibraryMap.get(gameId);
      const recentGame = recentlyPlayedMap.get(gameId);

      const lastPlayed = resolveLastPlayedTimestamp(g, recentGame, previousGame);
      const recentPlaytime = Math.max(
        Number(g.playtime_2weeks) || 0,
        Number(recentGame?.playtime_2weeks) || 0
      );
      const hasPlaytimeData = hasSteamPlaytimeFields(g, recentGame);

      return {
        gameId,
        playtime_forever: Number(g.playtime_forever) || 0,
        rtime_last_played: lastPlayed,
        playtime_2weeks: recentPlaytime,
        hasPlaytimeData,
        isFamilyShared: false,
      };
    });

    const familyUnionIds = new Set([...previousFamilyIds, ...currentFamilyIds]);
    // Un jeu POSSEDE n'est jamais Family. Le set Family est sticky
    // (previousFamilyIds) : si un jeu a un jour ete flagge Family (hoquet de
    // GetOwnedGames, ou accès anticipé partagé via Family avant achat) puis est
    // ensuite revenu dans GetOwnedGames, on le retire ici — sinon il est ajoute
    // une 2e fois en entree Family (doublon + badge "Famille" errone).
    for (const ownedId of ownedAppIds) {
      familyUnionIds.delete(ownedId);
    }
    for (const familyId of familyUnionIds) {
      const previousGame = previousLibraryMap.get(familyId);
      const recentGame = recentlyPlayedMap.get(familyId);

      const lastPlayed = resolveLastPlayedTimestamp(null, recentGame, previousGame);
      const recentPlaytime = Math.max(
        Number(previousGame?.playtime_2weeks) || 0,
        Number(recentGame?.playtime_2weeks) || 0
      );
      const foreverPlaytime = Math.max(
        Number(previousGame?.playtime_forever) || 0,
        Number(recentGame?.playtime_forever) || 0
      );
      const hasPlaytimeData =
        hasSteamPlaytimeFields(recentGame) ||
        Boolean(previousGame?.hasPlaytimeData);

      libraryGames.push({
        gameId: familyId,
        playtime_forever: foreverPlaytime,
        rtime_last_played: lastPlayed,
        playtime_2weeks: recentPlaytime,
        hasPlaytimeData,
        isFamilyShared: true,
      });
    }

    logger.info(
      `[FAMILY] gameLibrary final: ${libraryGames.length} entrées (${userGames.length} owned + ${familyUnionIds.size} Family sticky)`
    );

    user.gameLibrary = {
      games: libraryGames,
      lastFullSync: new Date(),
    };

    user.lastChecked = new Date();

    // Bump version pour invalidation cache frontend
    user.gamesVersion = new Date();

    await user.save();

    logger.info(`[OK] Bibliothèque mise à jour: ${user.gameLibrary.games.length} jeux`);

    if (result.followPrompts && result.followPrompts.length > 0) {
      try {
        const sent = await sendFollowPromptNotifications(
          user.steamId,
          result.followPrompts
        );
        logger.info(
          `[INFO] ${sent}/${result.followPrompts.length} notification(s) follow_prompt envoyée(s)`
        );
      } catch (promptError) {
        logger.error(
          '[SYNC] Erreur envoi notifications follow_prompt:',
          promptError.message
        );
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.info(`\n[SYNC] syncUserGames() - RÉSULTAT`);
    logger.info(`  - Résumé pour l'utilisateur synchronisé`);
    logger.info(
      `  - gameLibrary.games: ${user.gameLibrary.games.length} jeux écrits [OK]`
    );
    logger.info(
      `  - Games collection: ${userGames.length} documents créés/mis à jour [OK]`
    );
    logger.info(`  - Nouveaux jeux détectés: ${result.updatedGames.length}`);
    logger.info(`  - Auto-followed: ${result.updatedGames.length}`);
    logger.info(`  - Jeux supprimés: ${removedGameIds.length}`);
    logger.info(`  - Durée: ${duration}s\n`);

    return result;
  } catch (error) {
    logger.error(
      `Erreur lors de la synchronisation des jeux pour un utilisateur:`,
      error
    );
    result.error = error.message;
    return result;
  }
}

module.exports = {
  syncUserGames,
};
