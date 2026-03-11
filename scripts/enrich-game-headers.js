/**
 * Script one-shot : enrichit les Game existants avec header_image via Steam appdetails
 *
 * Usage : node scripts/enrich-game-headers.js
 *
 * - Parcourt tous les Game sans header_image
 * - Appelle Steam appdetails pour récupérer la vraie URL
 * - Met à jour header_image en base
 * - Rate-limité à 300ms entre chaque appel (respect rate limit Steam)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('../src/models/Game');
const { fetchGameDetails } = require('../src/services/steam/apiClient');
const { DATABASE_CONFIG } = require('../src/config/app');

const DELAY_MS = 300;

async function enrichGameHeaders() {
  await mongoose.connect(DATABASE_CONFIG.uri, DATABASE_CONFIG.options);
  console.log('Connecte a MongoDB');

  const retryMode = process.argv.includes('--retry-none');

  const filter = retryMode
    ? { header_image: 'none' }
    : { $or: [{ header_image: '' }, { header_image: { $exists: false } }] };

  const games = await Game.find(filter).lean();
  console.log(`${games.length} jeux à traiter${retryMode ? ' (retry none)' : ''}`);

  let updated = 0;
  let failed = 0;

  for (const game of games) {
    const details = await fetchGameDetails(game.appId).catch(() => null);

    const headerImage = details?.header_image || 'none';
    await Game.updateOne(
      { _id: game._id },
      { $set: { header_image: headerImage } }
    );

    if (details?.header_image) {
      updated++;
      console.log(`  [${updated}] ${game.name} (${game.appId}) -> ${details.header_image.substring(0, 70)}...`);
    } else {
      failed++;
      console.log(`  [SKIP] ${game.name} (${game.appId}) -> marqué 'none'`);
    }

    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log(`\nTermine :`);
  console.log(`  - Mis a jour : ${updated}`);
  console.log(`  - Sans image : ${failed}`);
  console.log(`  - Total      : ${games.length}`);

  await mongoose.disconnect();
}

enrichGameHeaders().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
