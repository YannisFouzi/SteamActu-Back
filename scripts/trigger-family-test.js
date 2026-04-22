/**
 * Force un syncUserGames pour tester la détection Steam Family.
 *
 * Usage: node scripts/trigger-family-test.js [steamId]
 * (depuis le dossier backend)
 * SteamId par défaut: 76561198158439485
 *
 * Ce script :
 *   1. Se connecte à MongoDB
 *   2. Charge l'user par steamId
 *   3. Appelle syncUserGames(user, { force: true, reason: 'family-test' })
 *   4. Affiche la bibliothèque résultante avec un focus sur les entrées
 *      `isFamilyShared: true`
 *   5. Si une notif follow_prompt doit partir, elle est envoyée dans le
 *      flow normal (sendFollowPromptNotifications côté syncUserGames).
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/User');
const Game = require('../src/models/Game');
const { syncUserGames } = require('../src/services/gamesSync/userProcessor');

async function run() {
  const steamId = process.argv[2] || '76561198158439485';

  console.log('='.repeat(70));
  console.log('[FAMILY-TEST] Démarrage');
  console.log(`  - steamId: ${steamId}`);
  console.log('='.repeat(70));

  try {
    console.log('[FAMILY-TEST] Connexion MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[FAMILY-TEST] Connecté\n');

    const user = await User.findOne({ steamId });

    if (!user) {
      console.error(`[FAMILY-TEST] User ${steamId} introuvable`);
      await mongoose.connection.close();
      process.exit(1);
    }

    console.log('[FAMILY-TEST] User chargé');
    console.log(`  - _id: ${user._id}`);
    console.log(`  - language: ${user.language}`);
    console.log(`  - libraryFollowMode: ${user.notificationSettings?.libraryFollowMode || 'off'}`);
    console.log(`  - followPromptNotifications: ${user.notificationSettings?.followPromptNotifications}`);
    console.log(`  - fcmTokens: ${user.notificationSettings?.fcmTokens?.length || 0}`);
    console.log(`  - followedGames: ${user.followedGames?.length || 0}`);
    console.log(`  - gameLibrary avant sync: ${user.gameLibrary?.games?.length || 0} entrées`);
    const previousFamily = (user.gameLibrary?.games || []).filter((g) => g.isFamilyShared);
    console.log(`    dont Family: ${previousFamily.length}`);
    for (const fg of previousFamily) {
      console.log(`      - ${fg.gameId} (last_played=${fg.rtime_last_played || 'n/a'})`);
    }
    console.log('');

    const result = await syncUserGames(user, { force: true, reason: 'family-test' });

    console.log('\n' + '='.repeat(70));
    console.log('[FAMILY-TEST] Résultat syncUserGames');
    console.log('='.repeat(70));
    console.log(`  - error: ${result.error || 'aucune'}`);
    console.log(`  - updatedGames (auto/prompt): ${result.updatedGames?.length || 0}`);
    for (const ug of result.updatedGames || []) {
      console.log(`    - ${ug.action} ${ug.appId} "${ug.name}"`);
    }
    console.log(`  - followPrompts: ${result.followPrompts?.length || 0}`);
    for (const fp of result.followPrompts || []) {
      console.log(`    - prompt ${fp.appId} "${fp.name}" (source=${fp.source})`);
    }
    console.log(`  - removedGames: ${result.removedGames?.length || 0}`);

    const refreshedUser = await User.findOne({ steamId }).lean();
    const familyEntries = (refreshedUser.gameLibrary?.games || []).filter(
      (g) => g.isFamilyShared
    );

    console.log(`\n[FAMILY-TEST] Family dans gameLibrary APRES sync: ${familyEntries.length}`);
    if (familyEntries.length > 0) {
      const gameIds = familyEntries.map((g) => g.gameId);
      const gameDocs = await Game.find({ appId: { $in: gameIds } })
        .select('appId name header_image')
        .lean();
      const gameMap = new Map(gameDocs.map((g) => [g.appId, g]));

      for (const fg of familyEntries) {
        const doc = gameMap.get(fg.gameId);
        console.log(
          `  - [FAMILY] ${fg.gameId} "${doc?.name || 'UNKNOWN'}" playtime_2weeks=${fg.playtime_2weeks}min last_played=${fg.rtime_last_played || 'n/a'}`
        );
      }
    }

    console.log('\n[FAMILY-TEST] Terminé');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('[FAMILY-TEST] Erreur:', error);
    try {
      await mongoose.connection.close();
    } catch (_) {
      // ignore
    }
    process.exit(1);
  }
}

run();
