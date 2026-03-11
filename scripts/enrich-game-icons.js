/**
 * Script one-shot : enrichit les GameSubscriptions existantes avec les images SteamGridDB
 *
 * Usage : node scripts/enrich-game-icons.js [--force]
 *
 * - Parcourt toutes les GameSubscriptions
 * - Pour chaque jeu sans image SteamGridDB, utilise la cascade complète :
 *   icons (official PNG) → icons (all) → logos → grids (thumb)
 * - Met à jour imageUrl en base
 * - Rate-limité à 200ms entre chaque appel
 * - --force : re-fetch même les jeux qui ont déjà une image SteamGridDB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const GameSubscription = require('../src/models/GameSubscription');
const { getGameImage } = require('../src/services/steamGridDbService');
const { DATABASE_CONFIG } = require('../src/config/app');

const DELAY_MS = 200;
const forceMode = process.argv.includes('--force');

async function enrichGameIcons() {
  await mongoose.connect(DATABASE_CONFIG.uri, DATABASE_CONFIG.options);
  console.log('Connecte a MongoDB');
  if (forceMode) {
    console.log('Mode --force : re-fetch toutes les images');
  }

  const subscriptions = await GameSubscription.find().lean();
  console.log(`${subscriptions.length} GameSubscriptions trouvees`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    if (!forceMode && sub.imageUrl && sub.imageUrl.includes('steamgriddb.com')) {
      skipped++;
      continue;
    }

    const imageUrl = await getGameImage(sub.gameId);

    if (imageUrl) {
      await GameSubscription.updateOne(
        { _id: sub._id },
        { $set: { imageUrl } }
      );
      updated++;
      console.log(`  [${updated}] ${sub.name} (${sub.gameId}) -> ${imageUrl.substring(0, 60)}...`);
    } else {
      failed++;
      console.log(`  [SKIP] ${sub.name} (${sub.gameId}) -> aucune image SteamGridDB`);
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log(`\nTermine :`);
  console.log(`  - Mis a jour : ${updated}`);
  console.log(`  - Deja OK    : ${skipped}`);
  console.log(`  - Sans image : ${failed}`);
  console.log(`  - Total      : ${subscriptions.length}`);

  await mongoose.disconnect();
}

enrichGameIcons().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
