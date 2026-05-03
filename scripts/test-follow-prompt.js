/**
 * Script de test pour les notifications follow_prompt.
 * Usage: node scripts/test-follow-prompt.js <steamId> <appId> <source> [name]
 * (depuis le dossier backend)
 *
 * Exemples:
 *   node scripts/test-follow-prompt.js 76561198158439485 2807960 library
 *   node scripts/test-follow-prompt.js 76561198158439485 3834090 wishlist
 *
 * Résolution name + imageUrl identique au pipeline prod
 * (userProcessor.js / syncWishlistService.js) :
 *   1. Wishlist.header_image / Game.header_image / GameSubscription.imageUrl
 *   2. SteamGridDB (getGameImage)
 *   3. Steam Store fetchGameDetails (live, dernier recours)
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  sendFollowPromptNotifications,
} = require('../src/services/notifications/notificationService');
const GameSubscription = require('../src/models/GameSubscription');
const Game = require('../src/models/Game');
const Wishlist = require('../src/models/Wishlist');
const { getGameImage } = require('../src/services/steamGridDbService');
const { fetchGameDetails } = require('../src/services/steam/apiClient');

const isUsableHeaderImage = (img) => Boolean(img && img !== 'none');

async function resolveGameInfo(appId) {
  const id = String(appId);

  const [sub, game, wishlist] = await Promise.all([
    GameSubscription.findOne({ gameId: id }).select('name imageUrl').lean(),
    Game.findOne({ appId: id }).select('name header_image').lean(),
    Wishlist.findOne({ appId: id }).select('name header_image').lean(),
  ]);

  // Résolution name : Wishlist > Game > GameSubscription > Steam live > fallback
  let name =
    wishlist?.name || game?.name || sub?.name || null;

  // Résolution imageUrl : GameSubscription.imageUrl > SteamGridDB > Wishlist/Game
  // header_image > Steam live > vide. Même cascade que le pipeline prod.
  let imageUrl = sub?.imageUrl || '';
  if (!imageUrl) {
    imageUrl = (await getGameImage(id).catch(() => null)) || '';
  }
  if (!imageUrl) {
    if (isUsableHeaderImage(wishlist?.header_image)) {
      imageUrl = wishlist.header_image;
    } else if (isUsableHeaderImage(game?.header_image)) {
      imageUrl = game.header_image;
    }
  }

  // Dernier recours : Steam Store (live) — coûteux mais utile pour un jeu
  // jamais touché par les syncs (cas Pragmata pour un user qui ne l'a ni
  // dans library ni dans wishlist).
  if (!name || !imageUrl) {
    const liveDetails = await fetchGameDetails(id).catch(() => null);
    if (liveDetails) {
      if (!name && liveDetails.name) name = liveDetails.name;
      if (!imageUrl && isUsableHeaderImage(liveDetails.header_image)) {
        imageUrl = liveDetails.header_image;
      }
    }
  }

  return {
    name: name || `Jeu ${id}`,
    imageUrl: imageUrl || '',
  };
}

async function testFollowPrompt() {
  try {
    const steamId = process.argv[2];
    const appId = process.argv[3];
    const source = process.argv[4];
    const nameArg = process.argv[5];

    if (!steamId || !appId || !source) {
      console.error(
        'Usage: node scripts/test-follow-prompt.js <steamId> <appId> <source> [name]',
      );
      console.error(
        'Exemple: node scripts/test-follow-prompt.js 76561198158439485 2807960 library',
      );
      console.error('Sources: library, wishlist, family');
      console.error(
        'Si [name] est omis, le script le résout via Wishlist/Game/GameSubscription/Steam.',
      );
      process.exit(1);
    }

    if (source !== 'library' && source !== 'wishlist' && source !== 'family') {
      console.error('Source invalide. Utilisez "library", "wishlist" ou "family".');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const resolved = await resolveGameInfo(appId);
    const gameName = nameArg || resolved.name;
    const imageUrl = resolved.imageUrl;

    console.log('\nSending follow_prompt notification...');
    console.log(`  Steam ID: ${steamId}`);
    console.log(`  App ID:   ${appId}`);
    console.log(`  Source:   ${source}`);
    console.log(`  Name:     ${gameName}`);
    console.log(`  Image:    ${imageUrl || '(none)'}`);

    const sentCount = await sendFollowPromptNotifications(steamId, [
      {
        appId: String(appId),
        name: gameName,
        imageUrl,
        source,
      },
    ]);

    console.log('\n' + '='.repeat(50));
    if (sentCount > 0) {
      console.log('SUCCESS - Follow prompt notification sent.');
      console.log('Check your mobile device.');
    } else {
      console.log('FAILURE - Notification could not be sent.');
      console.log('Check the logs above for details.');
    }
    console.log('='.repeat(50) + '\n');

    await mongoose.connection.close();
    process.exit(sentCount > 0 ? 0 : 1);
  } catch (error) {
    console.error('\nError while testing follow prompt:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testFollowPrompt();
