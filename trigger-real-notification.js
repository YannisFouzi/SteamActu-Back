/**
 * Script pour déclencher une VRAIE notification automatique
 * Simule une nouvelle actualité en resetant le timestamp puis lance la vérification
 *
 * Usage: node trigger-real-notification.js <appId>
 * Exemple: node trigger-real-notification.js 730
 */

const mongoose = require('mongoose');
require('dotenv').config();
const GameSubscription = require('./src/models/GameSubscription');
const { checkNewsRotation } = require('./src/services/newsRotationService');

async function triggerRealNotification() {
  try {
    // Récupérer l'appId depuis les arguments
    const appId = process.argv[2] || '730'; // Counter-Strike 2 par défaut

    console.log('🔗 Connexion à MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connecté à MongoDB\n');

    // Trouver le jeu dans la base
    const game = await GameSubscription.findOne({ gameId: appId });

    if (!game) {
      console.error(`❌ Jeu ${appId} introuvable dans GameSubscription`);
      console.log('💡 Astuce : Vérifiez que ce jeu a au moins 1 abonné');
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log('🎮 Jeu trouvé:', game.name);
    console.log(`📊 Abonnés: ${game.subscribers?.length || 0}`);
    console.log(`📅 Dernier timestamp: ${game.lastNewsTimestamp || 'jamais vérifié'}\n`);

    if (!game.subscribers || game.subscribers.length === 0) {
      console.warn('⚠️ Ce jeu n\'a aucun abonné. Aucune notification ne sera envoyée.');
      console.log('💡 Ajoutez-vous au jeu via l\'app pour recevoir la notification');
      await mongoose.connection.close();
      process.exit(1);
    }

    // Reset le timestamp pour forcer la détection de "nouvelle" actualité
    console.log('🔄 Reset du timestamp pour simuler une nouvelle actualité...');
    const oldTimestamp = game.lastNewsTimestamp;
    await GameSubscription.updateOne(
      { gameId: appId },
      {
        $set: {
          lastNewsTimestamp: 0,
          lastNewsCheck: new Date(0) // Mettre en priorité dans la rotation
        }
      }
    );
    console.log(`✅ Timestamp reseté (${oldTimestamp} → 0)\n`);

    console.log('=' .repeat(60));
    console.log('🚀 DÉCLENCHEMENT DE LA VÉRIFICATION AUTOMATIQUE');
    console.log('=' .repeat(60));
    console.log('⚠️ Ceci va déclencher le système RÉEL de vérification d\'actualités');
    console.log('⚠️ La notification sera envoyée via newsRotationService (comme en prod)\n');

    // Déclencher la rotation (vrai système automatique)
    const stats = await checkNewsRotation();

    console.log('\n' + '=' .repeat(60));
    console.log('📊 RÉSULTAT');
    console.log('=' .repeat(60));
    console.log(`✨ Nouvelles actualités détectées: ${stats.newNewsFound}`);
    console.log(`📬 Notifications envoyées: ${stats.notificationsSent}`);
    console.log(`❌ Erreurs: ${stats.errors?.length || 0}`);
    console.log('=' .repeat(60) + '\n');

    if (stats.notificationsSent > 0) {
      console.log('✅ SUCCESS! Une notification RÉELLE a été envoyée!');
      console.log('📱 Vérifiez votre téléphone maintenant.');
      console.log('🔍 Cherchez le bouton "Ne plus suivre ce jeu"\n');
    } else {
      console.log('❌ Aucune notification envoyée.');
      console.log('💡 Causes possibles:');
      console.log('   - Steam n\'a pas retourné d\'actualités pour ce jeu');
      console.log('   - Les notifications sont désactivées pour les abonnés');
      console.log('   - Aucun token FCM enregistré');
      console.log('   - Vérifiez les logs ci-dessus pour plus de détails\n');
    }

    await mongoose.connection.close();
    process.exit(stats.notificationsSent > 0 ? 0 : 1);
  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    console.error(error);
    process.exit(1);
  }
}

triggerRealNotification();
