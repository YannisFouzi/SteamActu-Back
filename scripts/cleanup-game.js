/**
 * Cleanup complet d'un jeu pour un user.
 *
 * Supprime toutes les traces du jeu dans :
 *   - Game (collection partagée)
 *   - GameSubscription (collection partagée)
 *   - UserNewsState (pour ce user uniquement)
 *   - User.followedGames[] (entrée du user)
 *   - User.gameLibrary.games[] (entrée du user)
 * Puis reset user.lastChecked pour court-circuiter le cooldown 6h du sync.
 *
 * Résultat : état "comme si Steam n'avait jamais vu ce jeu pour cet user".
 * Au prochain syncUserGames(user, { force: true }), le jeu sera re-détecté
 * et passera par tout le pipeline (resolver + upsert + follow_prompt notif).
 *
 * Usage:
 *   node scripts/cleanup-game.js <appId> <steamId>
 *   node scripts/cleanup-game.js 2483190 76561198158439485
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../src/models/User');
const Game = require('../src/models/Game');
const GameSubscription = require('../src/models/GameSubscription');
const UserNewsState = require('../src/models/UserNewsState');

async function cleanup(appId, steamId) {
  const appIdStr = String(appId);

  console.log('='.repeat(70));
  console.log(`[CLEANUP] Suppression complète du jeu pour test`);
  console.log(`  - appId : ${appIdStr}`);
  console.log(`  - steamId: ${steamId}`);
  console.log('='.repeat(70));

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[CLEANUP] Connecté MongoDB');

  // 1. Game (collection partagée) ----------------------------------------
  const gameBefore = await Game.findOne({ appId: appIdStr }).lean();
  if (gameBefore) {
    console.log(
      `  - Game trouvé: name="${gameBefore.name}" img_icon_url="${gameBefore.img_icon_url || '(vide)'}"`
    );
  } else {
    console.log(`  - Game: aucun doc existant`);
  }
  const gameDel = await Game.deleteOne({ appId: appIdStr });
  console.log(`  - Game.deleteOne: ${gameDel.deletedCount} supprimé(s)`);

  // 2. GameSubscription (collection partagée) ----------------------------
  const subBefore = await GameSubscription.findOne({ gameId: appIdStr }).lean();
  if (subBefore) {
    console.log(
      `  - GameSubscription trouvé: name="${subBefore.name}" subscribers=${subBefore.subscribers?.length || 0}`
    );
  } else {
    console.log(`  - GameSubscription: aucun doc existant`);
  }
  const subDel = await GameSubscription.deleteOne({ gameId: appIdStr });
  console.log(`  - GameSubscription.deleteOne: ${subDel.deletedCount} supprimé(s)`);

  // 3. UserNewsState (dedup) ---------------------------------------------
  const newsDel = await UserNewsState.deleteMany({
    steamId,
    appId: appIdStr,
  });
  console.log(`  - UserNewsState.deleteMany: ${newsDel.deletedCount} supprimé(s)`);

  // 4. User doc ----------------------------------------------------------
  const user = await User.findOne({ steamId });
  if (!user) {
    console.error(`[CLEANUP] User ${steamId} introuvable`);
    await mongoose.connection.close();
    process.exit(1);
  }

  const beforeFollow = (user.followedGames || []).length;
  user.followedGames = (user.followedGames || []).filter((entry) => {
    const id =
      typeof entry === 'string'
        ? entry
        : entry?.appId
        ? String(entry.appId)
        : null;
    return id !== appIdStr;
  });
  const removedFollow = beforeFollow - user.followedGames.length;
  console.log(`  - User.followedGames: ${removedFollow} entrée(s) supprimée(s)`);

  const beforeLib = user.gameLibrary?.games?.length || 0;
  if (user.gameLibrary?.games) {
    user.gameLibrary.games = user.gameLibrary.games.filter(
      (g) => g.gameId !== appIdStr
    );
  }
  const removedLib = beforeLib - (user.gameLibrary?.games?.length || 0);
  console.log(`  - User.gameLibrary.games: ${removedLib} entrée(s) supprimée(s)`);

  // Reset lastChecked pour bypasser le cooldown 6h (sinon syncUserGames skip)
  user.lastChecked = new Date(0);
  console.log(`  - User.lastChecked: reset à 1970-01-01 (cooldown bypassé)`);

  // Bump gamesVersion pour invalider le cache frontend
  user.gamesVersion = new Date();

  await user.save();

  console.log('\n[CLEANUP] Terminé — état réinitialisé');
  console.log(`  Lancer ensuite : node scripts/trigger-family-test.js ${steamId}`);
  await mongoose.connection.close();
  process.exit(0);
}

const appId = process.argv[2];
const steamId = process.argv[3];

if (!appId || !steamId) {
  console.error('Usage: node scripts/cleanup-game.js <appId> <steamId>');
  console.error('Exemple: node scripts/cleanup-game.js 2483190 76561198158439485');
  process.exit(1);
}

cleanup(appId, steamId).catch(async (err) => {
  console.error('[CLEANUP] Erreur:', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
