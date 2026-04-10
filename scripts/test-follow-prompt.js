/**
 * Script de test pour les notifications follow_prompt.
 * Usage: node scripts/test-follow-prompt.js <steamId> <appId> <source>
 * (depuis le dossier backend)
 *
 * Exemples:
 *   node scripts/test-follow-prompt.js 76561198158439485 2807960 library
 *   node scripts/test-follow-prompt.js 76561198158439485 3834090 wishlist
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const {
  sendFollowPromptNotifications,
} = require('../src/services/notifications/notificationService');

async function testFollowPrompt() {
  try {
    const steamId = process.argv[2];
    const appId = process.argv[3];
    const source = process.argv[4];

    if (!steamId || !appId || !source) {
      console.error(
        'Usage: node scripts/test-follow-prompt.js <steamId> <appId> <source>',
      );
      console.error(
        'Exemple: node scripts/test-follow-prompt.js 76561198158439485 2807960 library',
      );
      console.error('Sources: library, wishlist');
      process.exit(1);
    }

    if (source !== 'library' && source !== 'wishlist') {
      console.error('Source invalide. Utilisez "library" ou "wishlist".');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    console.log('\nSending follow_prompt notification...');
    console.log(`  Steam ID: ${steamId}`);
    console.log(`  App ID: ${appId}`);
    console.log(`  Source: ${source}`);

    const sentCount = await sendFollowPromptNotifications(steamId, [
      {
        appId: String(appId),
        name: `Test Game ${appId}`,
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
