/**
 * Script de test pour les notifications FCM
 * Usage: node test-notification.js <steamId>
 *
 * Exemple: node test-notification.js 76561198123456789
 */

const mongoose = require('mongoose');
require('dotenv').config();
const {
  sendNewsNotification,
} = require('./src/services/notifications/notificationService');
const User = require('./src/models/User');

async function testNotification() {
  try {
    // Récupérer le steamId depuis les arguments
    const steamId = process.argv[2];

    if (!steamId) {
      console.error('❌ Usage: node test-notification.js <steamId>');
      console.error('   Exemple: node test-notification.js 76561198123456789');
      process.exit(1);
    }

    console.log('🔗 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB');

    const user = await User.findOne({ steamId }).lean();
    if (!user) {
      console.error(`❌ Utilisateur ${steamId} introuvable dans la base.`);
      await mongoose.connection.close();
      process.exit(1);
    }

    const notificationSettings = user.notificationSettings || {};
    const newsEnabled = Boolean(notificationSettings.newsNotifications);
    const tokens = Array.isArray(notificationSettings.fcmTokens)
      ? notificationSettings.fcmTokens
      : [];

    console.log('\n📋 État utilisateur:');
    console.log(`   Notifications news activées: ${newsEnabled ? 'OUI' : 'NON'}`);
    console.log(`   Tokens FCM enregistrés: ${tokens.length}`);

    if (!newsEnabled) {
      console.warn(
        "⚠️ Les notifications d'actualités sont désactivées pour cet utilisateur. Activez-les dans l'app avant de lancer le test.",
      );
    }

    if (tokens.length === 0) {
      console.warn(
        "⚠️ Aucun token FCM enregistré. Assurez-vous d'avoir ouvert l'app et autorisé les notifications.",
      );
    }

    // Données de test
    const appId = '2807960'; // Counter-Strike 2
    const gameName = 'Battlefield 6';
    const newsTitle = 'Pack Montrez le chemin';
    const newsUrl = 'https://store.steampowered.com/news/app/2807960/view/588409432234264797?l=french';
    const newsGid = 'test_' + Date.now(); // GID de test

    console.log('\n📤 Envoi de la notification de test...');
    console.log(`   Steam ID: ${steamId}`);
    console.log(`   Jeu: ${gameName}`);
    console.log(`   Titre: ${newsTitle}`);
    console.log(`   URL: ${newsUrl}`);
    console.log(`   GID: ${newsGid}`);

    const success = await sendNewsNotification(
      steamId,
      appId,
      gameName,
      newsTitle,
      newsUrl,
      newsGid
    );

    console.log('\n' + '='.repeat(50));
    if (success) {
      console.log('✅ SUCCÈS - Notification envoyée avec succès!');
      console.log('   Vérifiez votre appareil mobile.');
    } else {
      console.log('❌ ÉCHEC - La notification n\'a pas pu être envoyée.');
      console.log('   Vérifiez les logs ci-dessus pour plus de détails.');
    }
    console.log('='.repeat(50) + '\n');

    await mongoose.connection.close();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Erreur lors du test:', error.message);
    console.error(error);
    process.exit(1);
  }
}

testNotification();
