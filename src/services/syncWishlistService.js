/**
 * Service de synchronisation de la wishlist Steam
 *
 * PHILOSOPHIE :
 * - Même logique que Games : collection Wishlist partagée entre users
 * - Pas de doublon : un jeu wishlisted = 1 document, N users le référencent
 * - User.wishlist.gameIds[] contient les références vers Wishlist.appId
 *
 * MODIFICATIONS :
 * - Stockage dans collection Wishlist (métadonnées communes)
 * - User.wishlist.gameIds[] au lieu de wishlistLastSync
 * - Détection nouveaux jeux via comparaison gameIds
 */

const User = require('../models/User');
const Wishlist = require('../models/Wishlist');
const GameSubscription = require('../models/GameSubscription');
const steamService = require('./steamService');
const { fetchGameDetails } = require('./steam/apiClient');
const { isInBucket } = require('../utils/userBucket');
const logger = require('../utils/logger');
const { CRON_CONFIG } = require('../config/app');
const { addUserToGameSubscription } = require('./users/subscriptionManager');
const { sendFollowPromptNotifications } = require('./notifications/notificationService');
const { getGameImage } = require('./steamGridDbService');
const {
  getFollowedAppIds,
  buildFollowedGamesEntry,
} = require('../utils/followedGamesHelpers');

/**
 * Sleep utilitaire (ms)
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSteamImageUrls(appId) {
  return {
    capsule: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/capsule_231x87.jpg`,
    header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
  };
}

/**
 * Enrichit les items wishlist avec le cache BDD et ne déclenche l'appel Steam que pour les jeux manquants.
 * @param {Array} wishlistItems - Items bruts renvoyés par Steam API
 * @returns {Promise<{ enrichedItems: Array, newWishlistDocs: Array }>}
 */
async function enrichWishlistItems(wishlistItems) {
  if (!Array.isArray(wishlistItems) || wishlistItems.length === 0) {
    return { enrichedItems: [], newWishlistDocs: [] };
  }

  const appIds = wishlistItems.map((item) => item.appid.toString());
  const existingDocs = await Wishlist.find({ appId: { $in: appIds } })
    .select('appId name header_image')
    .lean();
  const existingMap = new Map(existingDocs.map((doc) => [doc.appId, doc]));

  const enrichedItems = new Array(wishlistItems.length);
  const missingEntries = [];

  wishlistItems.forEach((item, index) => {
    const appIdStr = item.appid.toString();
    const cachedDoc = existingMap.get(appIdStr);
    const { capsule: defaultCapsule, header: defaultHeader } = buildSteamImageUrls(
      item.appid
    );

    if (cachedDoc) {
      const capsule = cachedDoc.header_image || defaultCapsule;
      const header = cachedDoc.header_image || defaultHeader;
      enrichedItems[index] = {
        appid: item.appid,
        name: cachedDoc.name,
        capsule,
        header_image: header,
        date_added: item.date_added,
        priority: item.priority,
      };
    } else {
      missingEntries.push({
        item,
        index,
        defaults: { capsule: defaultCapsule, header: defaultHeader },
      });
    }
  });

  const cacheHits = wishlistItems.length - missingEntries.length;
  logger.info(
    `[INFO] Cache hits: ${cacheHits}/${wishlistItems.length} jeux en base`
  );

  if (missingEntries.length === 0) {
    logger.info(`[WISHLIST] Aucun appel Steam supplémentaire nécessaire [OK]`);
    return { enrichedItems, newWishlistDocs: [] };
  }

  logger.info(
    `[WISHLIST] ${missingEntries.length} jeu(x) manquant(s) → fetch Steam Store`
  );

  const PARALLEL_REQUESTS = 20;
  const newWishlistDocs = [];

  for (let i = 0; i < missingEntries.length; i += PARALLEL_REQUESTS) {
    const batch = missingEntries.slice(i, i + PARALLEL_REQUESTS);
    const batchNumber = Math.floor(i / PARALLEL_REQUESTS) + 1;
    const totalBatches = Math.ceil(missingEntries.length / PARALLEL_REQUESTS);

    const batchResults = await Promise.all(
      batch.map(async ({ item, index, defaults }) => {
        const details = await fetchGameDetails(item.appid);

        const name = details?.name || `Game ${item.appid}`;
        const capsule =
          details?.capsule_image || defaults.capsule;
        const header =
          details?.header_image || defaults.header;

        const enriched = {
          appid: item.appid,
          name,
          capsule,
          header_image: header,
          date_added: item.date_added,
          priority: item.priority,
        };

        const doc = {
          appid: item.appid,
          name,
          capsule,
          header_image: header,
        };

        enrichedItems[index] = enriched;
        return doc;
      })
    );

    newWishlistDocs.push(...batchResults);
    logger.info(
      `   [SYNC] Batch ${batchNumber}/${totalBatches} → ${newWishlistDocs.length}/${missingEntries.length} jeux enrichis`
    );
  }

  logger.info(
    `[WISHLIST] Steam Store fetch terminé : ${newWishlistDocs.length} nouvel(le)s fiche(s)`
  );

  return { enrichedItems, newWishlistDocs };
}

/* =========================
   Upsert collection Wishlist
   ========================= */

async function upsertWishlistCollection(wishlistGames) {
  if (!wishlistGames || wishlistGames.length === 0) {
    logger.info(`[WISHLIST] upsertWishlistCollection() - Aucun nouveau jeu à insérer`);
    return;
  }

  const startTime = Date.now();
  logger.info(`[WISHLIST] upsertWishlistCollection() - START`);
  logger.info(`  - Nouveaux jeux à insérer: ${wishlistGames.length}`);

  const validGames = wishlistGames.filter((steamGame) => {
    return steamGame.name && steamGame.appid;
  });

  if (validGames.length === 0) {
    logger.info(`  [WARN] Aucun jeu valide après filtrage, skip bulkWrite`);
    return;
  }

  const bulkOps = validGames.map((steamGame) => ({
    updateOne: {
      filter: { appId: steamGame.appid.toString() },
      update: {
        $setOnInsert: {
          appId: steamGame.appid.toString(),
          name: steamGame.name,
          header_image:
            steamGame.capsule ||
            steamGame.header_image ||
            '',
        },
      },
      upsert: true,
    },
  }));

  await Wishlist.bulkWrite(bulkOps, { ordered: false });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  logger.info(`[WISHLIST] upsertWishlistCollection() - END`);
  logger.info(`  - Inserts/Upserts réalisés: ${bulkOps.length}`);
  logger.info(`  - Durée: ${duration}s`);
}

/* =========================
   Sync par utilisateur (existant)
   ========================= */

/**
 * Synchronise la wishlist d'un utilisateur - VERSION NORMALISÉE
 * @param {string} steamId - ID Steam de l'utilisateur
 * @param {Array} wishlistData - Données wishlist déjà récupérées (optionnel)
 * @returns {Promise<Object>} Résultat de la synchronisation
 */
async function syncUserWishlist(steamId, wishlistData = null) {
  try {
    logger.info(`\n[WISHLIST] Synchronisation utilisateur démarrée`);

    const user = await User.findOne({ steamId });
    if (!user) {
      logger.info(`[ERROR] Utilisateur non trouvé`);
      return { success: false, error: 'Utilisateur non trouvé' };
    }

    let wishlistItems = [];

    if (wishlistData && Array.isArray(wishlistData)) {
      logger.info(
        `📦 Utilisation des données déjà récupérées : ${wishlistData.length} jeux`
      );
      wishlistItems = wishlistData;
    } else {
      try {
        wishlistItems = await steamService.getUserWishlist(steamId);
        logger.info(`[INFO] Wishlist brute recuperee : ${wishlistItems.length} jeux`);
      } catch (error) {
        logger.error(`[ERROR] Erreur récupération wishlist:`, error.message);
        return { success: false, error: error.message };
      }
    }

    // Si la wishlist est vide
    if (!Array.isArray(wishlistItems) || wishlistItems.length === 0) {
      logger.info(`[INFO] Wishlist vide`);
      user.wishlist = { games: [], lastFullSync: new Date() };

      // Bump version pour invalidation cache frontend
      user.wishlistVersion = new Date();

      await user.save();
      return { success: true, newGames: 0, autoFollowed: 0 };
    }

    const { enrichedItems, newWishlistDocs } = await enrichWishlistItems(
      wishlistItems
    );

    // Insert uniquement les nouveaux jeux dans la collection Wishlist
    await upsertWishlistCollection(newWishlistDocs);

    logger.info(
      `[OK] Wishlist enrichie : ${enrichedItems.length} jeux (nouveaux: ${newWishlistDocs.length})`
    );

    // Récupérer gameIds actuels en BDD
    if (!Array.isArray(user.followedGames)) {
      user.followedGames = [];
    }

    const cachedGameIds = new Set(
      (user.wishlist?.games || []).map((g) => g.gameId)
    );

    // Détecter nouveaux jeux (dans Steam mais pas en BDD)
    const newGames = [];
    const followPrompts = [];
    for (const game of enrichedItems) {
      const appId = game.appid.toString();
      if (!cachedGameIds.has(appId)) {
        newGames.push({
          appId,
          name: game.name,
          imageUrl:
            game.capsule || game.header_image || '',
        });
      }
    }

    logger.info(`[NEW] ${newGames.length} nouveau(x) jeu(x) détecté(s)`);

    // Auto-follow si activé (paramètre spécifique wishlist)
    let autoFollowedCount = 0;
    let wishlistFollowMode = user.notificationSettings?.wishlistFollowMode;
    if (!wishlistFollowMode) {
      const legacy = user.notificationSettings?.autoFollowWishlistGames;
      if (typeof legacy === 'boolean') {
        wishlistFollowMode = legacy ? 'auto' : 'off';
      } else {
        wishlistFollowMode = 'off';
      }
    }

    if (newGames.length > 0 && wishlistFollowMode !== 'off') {
      const existingFollowed = new Set(getFollowedAppIds(user));
      const gamesToConsider = newGames.filter(
        (game) => !existingFollowed.has(game.appId)
      );

      if (wishlistFollowMode === 'auto') {
        if (gamesToConsider.length > 0) {
          try {
            for (const game of gamesToConsider) {
              await addUserToGameSubscription(
                game.appId,
                user.steamId,
                game.name,
                game.imageUrl
              );
              user.followedGames.push(buildFollowedGamesEntry(game.appId));
              existingFollowed.add(game.appId);
            }

            autoFollowedCount = gamesToConsider.length;
            logger.info(`[OK] ${autoFollowedCount} jeu(x) auto-suivi(s)`);
          } catch (error) {
            logger.error(`[ERROR] Erreur auto-follow:`, error.message);
          }
        }
      } else if (wishlistFollowMode === 'prompt') {
        // Batch-fetch des imageUrl déjà connues via GameSubscription
        // (même source que NewsTab — cohérence visuelle avec le fil d'actu)
        const subs = await GameSubscription.find({
          gameId: { $in: gamesToConsider.map((g) => g.appId) },
        })
          .select('gameId imageUrl')
          .lean();
        const subsImageMap = new Map(
          subs
            .map((s) => [s.gameId, s.imageUrl])
            .filter(([, url]) => Boolean(url))
        );

        for (const game of gamesToConsider) {
          let imageUrl = subsImageMap.get(game.appId) || '';
          if (!imageUrl) {
            imageUrl = (await getGameImage(game.appId, game.name).catch(() => null)) || '';
          }
          if (!imageUrl) {
            imageUrl = game.imageUrl || '';
          }

          followPrompts.push({
            appId: game.appId,
            name: game.name,
            imageUrl,
            source: 'wishlist',
          });
        }
      }
    }

    // Toujours s'assurer qu'aucun doublon ne subsiste — dedup sur appId en
    // gardant la plus ancienne followedAt (la date d'ajout réelle).
    const seenAppIds = new Set();
    user.followedGames = user.followedGames.filter((entry) => {
      const appId =
        typeof entry === 'string'
          ? entry
          : entry?.appId
          ? String(entry.appId)
          : null;
      if (!appId || seenAppIds.has(appId)) return false;
      seenAppIds.add(appId);
      return true;
    });

    // Mettre à jour User.wishlist avec games[] (date_added user-specific)
    user.wishlist = {
      games: enrichedItems.map((item) => ({
        gameId: item.appid.toString(),
        date_added: item.date_added || 0,
        priority: item.priority || 0,
      })),
      lastFullSync: new Date(),
    };

    // Bump version pour invalidation cache frontend
    user.wishlistVersion = new Date();

    await user.save();

    logger.info(`[OK] Wishlist mise à jour: ${wishlistItems.length} jeux\n`);

    if (followPrompts.length > 0) {
      try {
        const sent = await sendFollowPromptNotifications(user.steamId, followPrompts);
        logger.info(
          `[INFO] ${sent}/${followPrompts.length} notification(s) follow_prompt envoyée(s) (wishlist)`
        );
      } catch (promptError) {
        logger.error(
          `[WISHLIST] [ERROR] Erreur envoi notifications follow_prompt:`,
          promptError.message
        );
      }
    }

    return {
      success: true,
      newGames: newGames.length,
      autoFollowed: autoFollowedCount,
      totalWishlistGames: wishlistItems.length,
      newGamesDetails: newGames,
      followPrompts,
    };
  } catch (error) {
    logger.error(`[ERROR] Erreur sync wishlist:`, error);
    return { success: false, error: error.message };
  }
}

/* =========================
   FULL (existant)
   ========================= */

/**
 * Synchronise la wishlist de tous les utilisateurs
 * @returns {Promise<Object>} Statistiques de la synchronisation
 */
async function syncAllUsersWishlists() {
  try {
    logger.info('\n' + '='.repeat(60));
    logger.info('[NEW] DÉBUT SYNCHRONISATION GLOBALE WISHLISTS');
    logger.info('='.repeat(60));

    const startTime = Date.now();

    // Récupérer tous les utilisateurs
    const users = await User.find({});
    logger.info(`[INFO] ${users.length} utilisateur(s) à synchroniser`);

    const stats = {
      totalUsers: users.length,
      successCount: 0,
      errorCount: 0,
      totalNewGames: 0,
      totalAutoFollowed: 0,
      errors: [],
    };

    // Synchroniser chaque utilisateur avec pause entre les appels
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      logger.info(`\n[${i + 1}/${users.length}] Traitement utilisateur`);

      const result = await syncUserWishlist(user.steamId);

      if (result.success) {
        stats.successCount++;
        stats.totalNewGames += result.newGames || 0;
        stats.totalAutoFollowed += result.autoFollowed || 0;
      } else {
        stats.errorCount++;
        stats.errors.push({
          steamId: user.steamId,
          error: result.error,
        });
      }

      // Pause de 1 seconde entre chaque utilisateur pour respecter les limites API
      if (i < users.length - 1) {
        await sleep(1000);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    logger.info('\n' + '='.repeat(60));
    logger.info('[INFO] RÉSUMÉ SYNCHRONISATION WISHLISTS');
    logger.info('='.repeat(60));
    logger.info(`[TIMER] Durée : ${duration}s`);
    logger.info(`[OK] Succès : ${stats.successCount}`);
    logger.info(`[ERROR] Erreurs : ${stats.errorCount}`);
    logger.info(`[NEW] Nouveaux jeux détectés : ${stats.totalNewGames}`);
    logger.info(`[INFO] Jeux auto-suivis : ${stats.totalAutoFollowed}`);
    if (stats.errors.length > 0) {
      logger.info('\n[ERROR] Erreurs détaillées :');
      stats.errors.forEach(() => {
        logger.info(`  - Erreur signalée lors de la synchronisation d'un utilisateur`);
      });
    }
    logger.info('='.repeat(60) + '\n');

    return stats;
  } catch (error) {
    logger.error(
      '[ERROR] Erreur globale lors de la synchronisation des wishlists:',
      error
    );
    throw error;
  }
}

/* =========================
   NEW: Sync par groupe
   ========================= */

/**
 * Synchronise les wishlists pour un sous-ensemble d'utilisateurs
 * déterminé par (hash(userId) % groupsTotal === groupIndex).
 *
 * @param {number} groupIndex - index du groupe courant (0..groupsTotal-1)
 * @param {number} groupsTotal - nombre total de groupes (>=1)
 * @returns {Promise<Object>} Statistiques pour ce groupe
 */
async function syncWishlistsByGroup(
  groupIndex,
  groupsTotal = CRON_CONFIG.GROUPS_TOTAL
) {
  const gi = Number(groupIndex);
  const gt =
    Number(groupsTotal) > 0 ? Number(groupsTotal) : CRON_CONFIG.GROUPS_TOTAL;

  if (!Number.isInteger(gi) || !Number.isInteger(gt) || gi < 0 || gt <= 0 || gi >= gt) {
    throw new Error(
      `syncWishlistsByGroup: paramètres invalides (groupIndex=${groupIndex}, groupsTotal=${groupsTotal})`
    );
  }

  logger.info('\n' + '='.repeat(60));
  logger.info(`🚀 DÉBUT SYNC WISHLISTS (GROUPE ${gi + 1}/${gt})`);
  logger.info('='.repeat(60));

  const startTime = Date.now();

  // On minimise la projection : uniquement ce qui est nécessaire ici
  const users = await User.find({}, { _id: 1, steamId: 1 }).lean();
  logger.info(`[INFO] ${users.length} utilisateur(s) totaux`);

  // Bucket stable par hash (user._id si dispo, sinon steamId)
  const bucketUsers = users.filter((u) => isInBucket(u, gi, gt));

  logger.info(`[INFO] Groupe ${gi + 1}/${gt} → ${bucketUsers.length} utilisateur(s) à traiter`);

  const stats = {
    groupIndex: gi,
    groupsTotal: gt,
    usersInGroup: bucketUsers.length,
    usersProcessed: 0,
    successCount: 0,
    errorCount: 0,
    newGames: 0,
    totalAutoFollowed: 0,
    errors: [],
  };

  for (let i = 0; i < bucketUsers.length; i++) {
    const u = bucketUsers[i];
    logger.info(
      `\n[${i + 1}/${bucketUsers.length}] Groupe ${gi + 1}/${gt} → Traitement utilisateur`
    );

    const result = await syncUserWishlist(u.steamId);

    stats.usersProcessed++;

    if (result && result.success) {
      stats.successCount++;
      stats.newGames += result.newGames || 0;
      stats.totalAutoFollowed += result.autoFollowed || 0;
    } else {
      stats.errorCount++;
      stats.errors.push({ steamId: u.steamId, error: result?.error || 'unknown' });
    }

    // Respect des limites API : pause 1s entre utilisateurs
    if (i < bucketUsers.length - 1) {
      await sleep(1000);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  logger.info('\n' + '='.repeat(60));
  logger.info(`[INFO] RÉSUMÉ WISHLISTS GROUPE ${gi + 1}/${gt}`);
  logger.info('='.repeat(60));
  logger.info(`[TIMER] Durée : ${duration}s`);
  logger.info(`[INFO] Users dans le groupe : ${stats.usersInGroup}`);
  logger.info(`[OK] Succès : ${stats.successCount}`);
  logger.info(`[ERROR] Erreurs : ${stats.errorCount}`);
  logger.info(`[NEW] Nouveaux jeux : ${stats.newGames}`);
  logger.info(`[INFO] Auto-suivis : ${stats.totalAutoFollowed}`);
  if (stats.errors.length > 0) {
    logger.info('\n[ERROR] Erreurs détaillées :');
    stats.errors.forEach(() =>
      logger.info(`  - Erreur signalée lors de la synchronisation d'un utilisateur`)
    );
  }
  logger.info('='.repeat(60) + '\n');

  return stats;
}

module.exports = {
  syncUserWishlist,
  syncAllUsersWishlists,
  syncWishlistsByGroup,
};
