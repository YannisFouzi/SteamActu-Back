/**
 * Processeur pour la synchronisation des jeux utilisateur
 *
 * - Mise à jour de gameLibrary.games[] avec la structure normalisée
 * - Création/mise à jour des documents Game en collection séparée
 * - Détection des jeux supprimés et gestion de l'auto-follow
 */

const steamService = require('../steamService');
const Game = require('../../models/Game');
const { addUserToGameSubscription } = require('../users/subscriptionManager');
const { sendFollowPromptNotifications } = require('../notifications/notificationService');

const SYNC_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function canSyncUser(user) {
  const cooldownTime = new Date(Date.now() - SYNC_COOLDOWN_MS);
  const lastSyncTime = user.lastChecked || new Date(0);
  const canSync = lastSyncTime <= cooldownTime;

  console.log('[SYNC] canSyncUser() - Vérification utilisateur');
  console.log(`  - lastChecked: ${lastSyncTime.toISOString()}`);
  console.log(`  - Cooldown expires at: ${cooldownTime.toISOString()}`);
  console.log(`  - Current time: ${new Date().toISOString()}`);
  console.log(`  - Can sync: ${canSync ? 'true ✅' : 'false ❌'}`);

  return canSync;
}

function normalizeFollowedGames(user) {
  if (!Array.isArray(user.followedGames)) {
    return new Set();
  }

  return new Set(
    user.followedGames
      .filter((game) => typeof game === 'string')
      .map((appId) => appId)
  );
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

  const startTime = Date.now();
  console.log(`[SYNC] upsertGamesCollection() - START`);
  console.log(`  - Jeux à traiter: ${steamGames.length}`);

  const appIds = steamGames.map((steamGame) => steamGame.appid.toString());
  const existingGames = await Game.find({ appId: { $in: appIds } })
    .select('appId')
    .lean();
  const existingSet = new Set(existingGames.map((game) => game.appId));

  const newGames = steamGames.filter(
    (steamGame) => !existingSet.has(steamGame.appid.toString())
  );

  console.log(
    `  - Déjà présents: ${steamGames.length - newGames.length} | Nouveaux: ${newGames.length}`
  );

  if (newGames.length === 0) {
    console.log(
      `[SYNC] upsertGamesCollection() - Aucun nouvel appId à insérer ✅`
    );
    return;
  }

  const bulkOps = newGames.map((steamGame) => ({
    updateOne: {
      filter: { appId: steamGame.appid.toString() },
      update: {
        $setOnInsert: {
          appId: steamGame.appid.toString(),
          name: steamGame.name || 'Unknown Game',
          img_icon_url: steamGame.img_icon_url || '',
        },
      },
      upsert: true,
    },
  }));

  await Game.bulkWrite(bulkOps, { ordered: false });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[SYNC] upsertGamesCollection() - END`);
  console.log(`  - Inserts réalisés: ${bulkOps.length}`);
  console.log(`  - Durée: ${duration}s`);
}

/**
 * Détecte les jeux supprimés de la bibliothèque Steam
 * @param {Object} user - Utilisateur
 * @param {Array} steamGames - Jeux actuels depuis Steam
 * @returns {Array} - Liste des appIds supprimés
 */
function detectRemovedGames(user, steamGames) {
  const cachedGameIds = new Set(
    (user.gameLibrary?.games || []).map((g) => g.gameId)
  );
  const steamAppIds = new Set(steamGames.map((g) => g.appid.toString()));

  const removedGameIds = [];
  for (const cachedId of cachedGameIds) {
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
      gamesToHandle.push({ appId, name: game.name });
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

      console.log(
        `✅ ${gamesToHandle.length} GameSubscriptions mises à jour via auto-follow`
      );
    } else if (followMode === 'prompt') {
      for (const entry of gamesToHandle) {
        const { appId } = entry;
        const gameDoc = gamesMap.get(appId);
        const gameName = gameDoc?.name || entry.name || `Jeu ${appId}`;
        const imageUrl = gameDoc?.img_icon_url
          ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
          : '';

        newGames.push({
          appId,
          name: gameName,
          action: 'prompt',
        });

        followPrompts.push({
          appId,
          name: gameName,
          imageUrl,
          source: 'library',
        });
      }
    }
  } catch (error) {
    console.error('❌ Erreur traitement follow mode:', error.message);
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
async function syncUserGames(user) {
  const result = createUserResult(user);

  try {
    const startTime = Date.now();
    console.log(`\n[SYNC] syncUserGames() - START`);
    console.log(`  - Démarrage de la synchronisation utilisateur`);

    if (!canSyncUser(user)) {
      const lastSyncTime = user.lastChecked || new Date(0);
      console.log(
        `Utilisateur synchronisé récemment (${lastSyncTime.toISOString()}), en attente.`
      );
      console.log(`[SYNC] syncUserGames() - SKIPPED (cooldown actif)\n`);
      return {
        ...result,
        skipped: true,
        message: 'Synchronisation récente, ignorée',
      };
    }

    console.log(`[SYNC] Steam API GetOwnedGames`);

    const userGames = await steamService.getUserGames(user.steamId);

    if (!userGames || !Array.isArray(userGames)) {
      console.error(`Réponse invalide de l'API Steam pour un utilisateur`);
      console.log(`[SYNC] syncUserGames() - ERROR (Invalid Steam response)\n`);
      result.error = "Réponse invalide de l'API Steam";
      return result;
    }

    console.log(`  - Jeux récupérés: ${userGames.length}`);

    await upsertGamesCollection(userGames);
    console.log(`✅ ${userGames.length} jeux créés/mis à jour dans Games`);

    const cachedGameIds = new Set(
      (user.gameLibrary?.games || []).map((g) => g.gameId)
    );

    const removedGameIds = detectRemovedGames(user, userGames);
    if (removedGameIds.length > 0) {
      console.log(
        `🗑️  ${removedGameIds.length} jeu(x) supprimé(s) de la bibliothèque Steam`
      );
      result.removedGames = removedGameIds;

      user.followedGames = user.followedGames.filter(
        (appId) => !removedGameIds.includes(appId)
      );
    }

    const followedGamesSet = normalizeFollowedGames(user);

    const autoFollowResult = await processAutoFollow(
      user,
      userGames,
      followedGamesSet,
      cachedGameIds
    );

    result.updatedGames = autoFollowResult.newGames;
    result.followPrompts = autoFollowResult.followPrompts || [];

    if (autoFollowResult.hasNewFollowedGames) {
      user.followedGames = Array.from(new Set(autoFollowResult.updatedFollowedGames));
      console.log(
        `✅ ${result.updatedGames.length} jeux auto-suivis pour un utilisateur`
      );
    }

    user.gameLibrary = {
      games: userGames.map((g) => ({
        gameId: g.appid.toString(),
        playtime_forever: g.playtime_forever || 0,
        rtime_last_played: g.rtime_last_played || 0,
        playtime_2weeks: g.playtime_2weeks || 0,
      })),
      lastFullSync: new Date(),
    };

    user.lastChecked = new Date();

    // ✨ Bump version pour invalidation cache frontend
    user.gamesVersion = new Date();

    await user.save();

    console.log(`✅ Bibliothèque mise à jour: ${user.gameLibrary.games.length} jeux`);

    if (result.followPrompts && result.followPrompts.length > 0) {
      try {
        const sent = await sendFollowPromptNotifications(
          user.steamId,
          result.followPrompts
        );
        console.log(
          `📬 ${sent}/${result.followPrompts.length} notification(s) follow_prompt envoyée(s)`
        );
      } catch (promptError) {
        console.error(
          '[SYNC] Erreur envoi notifications follow_prompt:',
          promptError.message
        );
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[SYNC] syncUserGames() - RÉSULTAT`);
    console.log(`  - Résumé pour l'utilisateur synchronisé`);
    console.log(
      `  - gameLibrary.games: ${user.gameLibrary.games.length} jeux écrits ✅`
    );
    console.log(
      `  - Games collection: ${userGames.length} documents créés/mis à jour ✅`
    );
    console.log(`  - Nouveaux jeux détectés: ${result.updatedGames.length}`);
    console.log(`  - Auto-followed: ${result.updatedGames.length}`);
    console.log(`  - Jeux supprimés: ${removedGameIds.length}`);
    console.log(`  - Durée: ${duration}s\n`);

    return result;
  } catch (error) {
    console.error(
      `Erreur lors de la synchronisation des jeux pour un utilisateur:`,
      error
    );
    result.error = error.message;
    return result;
  }
}

module.exports = {
  syncUserGames,
  canSyncUser,
  normalizeFollowedGames,
  processAutoFollow,
  upsertGamesCollection,
  detectRemovedGames,
};
