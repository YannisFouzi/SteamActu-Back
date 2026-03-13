/**
 * Script de test pour les notifications FCM.
 * Usage: node test-notification.js <steamId> [appId]
 *
 * Exemples:
 *   node test-notification.js 76561198123456789
 *   node test-notification.js 76561198123456789 570
 */

const mongoose = require('mongoose');
require('dotenv').config();

const {
  sendNewsNotification,
} = require('./src/services/notifications/notificationService');
const steamService = require('./src/services/steamService');
const { extractFirstImage } = require('./src/services/newsFeed/imageExtractor');
const User = require('./src/models/User');

async function testNotification() {
  try {
    const steamId = process.argv[2];
    const appId = process.argv[3] || '2807960';

    if (!steamId) {
      console.error('Usage: node test-notification.js <steamId> [appId]');
      console.error('Exemple: node test-notification.js 76561198123456789 570');
      process.exit(1);
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const user = await User.findOne({ steamId }).lean();
    if (!user) {
      console.error(`User ${steamId} not found in database.`);
      await mongoose.connection.close();
      process.exit(1);
    }

    const notificationSettings = user.notificationSettings || {};
    const newsEnabled = Boolean(notificationSettings.newsNotifications);
    const tokens = Array.isArray(notificationSettings.fcmTokens)
      ? notificationSettings.fcmTokens
      : [];
    const language = user.language || 'fr';

    console.log('\nUser state:');
    console.log(`  News notifications enabled: ${newsEnabled ? 'YES' : 'NO'}`);
    console.log(`  Registered FCM tokens: ${tokens.length}`);
    console.log(`  Language: ${language}`);

    if (!newsEnabled) {
      console.warn(
        "Warning: news notifications are disabled for this user. Enable them in the app before running the test.",
      );
    }

    if (tokens.length === 0) {
      console.warn(
        'Warning: no FCM token registered. Open the app and allow notifications first.',
      );
    }

    console.log('\nFetching recent Steam news...');
    console.log(`  App ID: ${appId}`);

    const newsItems = await steamService.getGameNews(appId, 10, 0, language);
    const availableNews = Array.isArray(newsItems) ? newsItems : [];
    const selectedNews = availableNews.find(item =>
      Boolean(extractFirstImage(item?.contents)),
    );
    const latestNews = selectedNews || availableNews[0] || null;

    if (!latestNews) {
      console.error(`No Steam news found for appId=${appId}.`);
      await mongoose.connection.close();
      process.exit(1);
    }

    const gameName = latestNews.feedlabel || `Game ${appId}`;
    const newsTitle = latestNews.title || 'Steam news test';
    const newsUrl =
      latestNews.url || `https://store.steampowered.com/news/app/${appId}`;
    const newsGid = String(latestNews.gid || `test_${Date.now()}`);
    const firstImageUrl = extractFirstImage(latestNews.contents);

    console.log('\nSending test notification...');
    console.log(`  Steam ID: ${steamId}`);
    console.log(`  App ID: ${appId}`);
    console.log(`  Game: ${gameName}`);
    console.log(`  Title: ${newsTitle}`);
    console.log(`  URL: ${newsUrl}`);
    console.log(`  GID: ${newsGid}`);
    console.log(
      `  News selection: ${selectedNews ? 'first recent news with image' : 'latest news fallback'}`,
    );
    console.log(
      `  Image detected: ${firstImageUrl ? 'YES' : 'NO'}${
        firstImageUrl ? ` (${firstImageUrl})` : ''
      }`,
    );

    const success = await sendNewsNotification(
      steamId,
      appId,
      gameName,
      newsTitle,
      newsUrl,
      newsGid,
      firstImageUrl,
    );

    console.log('\n' + '='.repeat(50));
    if (success) {
      console.log('SUCCESS - Notification sent.');
      console.log('Check your mobile device.');
    } else {
      console.log('FAILURE - Notification could not be sent.');
      console.log('Check the logs above for details.');
    }
    console.log('='.repeat(50) + '\n');

    await mongoose.connection.close();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\nError while testing notification:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testNotification();
