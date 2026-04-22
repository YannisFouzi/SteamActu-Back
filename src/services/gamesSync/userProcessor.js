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

function canSyncUser(user, force = false) {
  if (force) {
    return true;
  }

  const cooldownTime = new Date(Date.now() - SYNC_COOLDOWN_MS);
  const lastSyncTime = user.lastChecked || new Date(0);
  const canSync = lastSyncTime <= cooldownTime;

  console.log('[SYNC] canSyncUser() - Vérification utilisateur');
  console.log(`  - lastChecked: ${lastSyncTime.toISOString()}`);
  console.log(`  - Cooldown expires at: ${cooldownTime.toISOString()}`);
  console.log(`  - Current time: ${new Date().toISOString()}`);
  console.log(`  - Can sync: ${canSync ? 'true' : 'false'}`);

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
      `[SYNC] upsertGamesCollection() - Aucun nouvel appId à insérer [OK]`
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

      console.log(
        `[OK] ${gamesToHandle.length} GameSubscriptions mises à jour via auto-follow`
      );
    } else if (followMode === 'prompt') {
      for (const entry of gamesToHandle) {
        const { appId, source } = entry;
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
          source: source || 'library',
        });
      }
    }
  } catch (error) {
    console.error('[ERROR] Erreur traitement follow mode:', error.message);
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
    console.log(`\n[SYNC] syncUserGames() - START`);
    console.log(`  - Démarrage de la synchronisation utilisateur`);

    if (!canSyncUser(user, force)) {
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

    console.log(`[SYNC] Steam API GetOwnedGames + GetRecentlyPlayedGames (reason=${reason}, force=${force})`);

    const [userGames, recentlyPlayedGames] = await Promise.all([
      steamService.getUserGames(user.steamId),
      steamService.getRecentlyPlayedGames(user.steamId).catch((error) => {
        console.warn(
          '[SYNC] GetRecentlyPlayedGames indisponible, fallback OwnedGames:',
          error?.message || error
        );
        return [];
      }),
    ]);

    if (!userGames || !Array.isArray(userGames)) {
      console.error(`Réponse invalide de l'API Steam pour un utilisateur`);
      console.log(`[SYNC] syncUserGames() - ERROR (Invalid Steam response)\n`);
      result.error = "Réponse invalide de l'API Steam";
      return result;
    }

    console.log(`  - Jeux récupérés: ${userGames.length}`);
    console.log(`  - Jeux récemment lancés (2 semaines): ${recentlyPlayedGames.length}`);

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

    console.log(`[FAMILY] Analyse diff recentlyPlayed \\ owned`);
    console.log(`  - Owned: ${userGames.length} | RecentlyPlayed: ${recentlyPlayedGames.length}`);
    console.log(`  - Family détectés ce run: ${familyGames.length}`);
    if (familyGames.length > 0) {
      for (const fg of familyGames) {
        const wasKnown = previousFamilyIds.has(fg.appid?.toString());
        console.log(
          `  - [FAMILY]${wasKnown ? ' (déjà connu)' : ' (NOUVEAU)'} appId=${fg.appid} name="${fg.name}" playtime_2weeks=${fg.playtime_2weeks || 0}min rtime_last_played=${fg.rtime_last_played || 'n/a'}`
        );
      }
    }

    // ---- Upsert Games (owned + family) --------------------------------
    // Les Family games ont aussi besoin d'un document Game pour que le
    // frontend puisse résoudre name + header_image via le lazy-loading.
    await upsertGamesCollection([...userGames, ...familyGames]);
    console.log(
      `[OK] ${userGames.length + familyGames.length} jeux créés/mis à jour dans Games (dont ${familyGames.length} Family)`
    );

    const cachedGameIds = new Set(
      previousLibraryGames.map((g) => g.gameId)
    );

    const removedGameIds = detectRemovedGames(user, userGames);
    if (removedGameIds.length > 0) {
      console.log(
        `[INFO] ${removedGameIds.length} jeu(x) supprimé(s) de la bibliothèque Steam`
      );
      result.removedGames = removedGameIds;

      user.followedGames = user.followedGames.filter(
        (appId) => !removedGameIds.includes(appId)
      );
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
      console.log(
        `[FAMILY] ${newFamilyIds.length} nouveau(x) jeu(x) Family déclenchent le pipeline follow_prompt (si mode=prompt)`
      );
    }

    result.updatedGames = autoFollowResult.newGames;
    result.followPrompts = autoFollowResult.followPrompts || [];

    if (autoFollowResult.hasNewFollowedGames) {
      user.followedGames = Array.from(new Set(autoFollowResult.updatedFollowedGames));
      console.log(
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

      return {
        gameId,
        playtime_forever: Number(g.playtime_forever) || 0,
        rtime_last_played: lastPlayed,
        playtime_2weeks: recentPlaytime,
        isFamilyShared: false,
      };
    });

    const familyUnionIds = new Set([...previousFamilyIds, ...currentFamilyIds]);
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

      libraryGames.push({
        gameId: familyId,
        playtime_forever: foreverPlaytime,
        rtime_last_played: lastPlayed,
        playtime_2weeks: recentPlaytime,
        isFamilyShared: true,
      });
    }

    console.log(
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

    console.log(`[OK] Bibliothèque mise à jour: ${user.gameLibrary.games.length} jeux`);

    if (result.followPrompts && result.followPrompts.length > 0) {
      try {
        const sent = await sendFollowPromptNotifications(
          user.steamId,
          result.followPrompts
        );
        console.log(
          `[INFO] ${sent}/${result.followPrompts.length} notification(s) follow_prompt envoyée(s)`
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
      `  - gameLibrary.games: ${user.gameLibrary.games.length} jeux écrits [OK]`
    );
    console.log(
      `  - Games collection: ${userGames.length} documents créés/mis à jour [OK]`
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
};
