/**
 * Script : vérifie la disponibilité des logos SteamGridDB pour les jeux sans icône SteamGridDB
 *
 * Usage : node scripts/check-logos.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const GameSubscription = require('../src/models/GameSubscription');
const { DATABASE_CONFIG } = require('../src/config/app');
const axios = require('axios');

const STEAMGRIDDB_API_KEY = process.env.STEAMGRIDDB_API_KEY;
const STEAMGRIDDB_BASE_URL = 'https://www.steamgriddb.com/api/v2';
const DELAY_MS = 100;

async function checkLogosAvailability() {
  await mongoose.connect(DATABASE_CONFIG.uri, DATABASE_CONFIG.options);
  console.log('Connecté à MongoDB\n');

  // Find all GameSubscriptions without SteamGridDB images
  const subscriptions = await GameSubscription.find({
    $or: [
      { imageUrl: { $exists: false } },
      { imageUrl: '' },
      { imageUrl: { $not: /steamgriddb\.com/ } }
    ]
  }).lean();

  console.log(`${subscriptions.length} GameSubscriptions sans icône SteamGridDB trouvées\n`);
  console.log('Vérification des logos disponibles...\n');

  let withLogos = 0;
  let withoutLogos = 0;

  for (const sub of subscriptions) {
    try {
      const response = await axios.get(
        `${STEAMGRIDDB_BASE_URL}/logos/steam/${sub.gameId}`,
        {
          headers: {
            'Authorization': `Bearer ${STEAMGRIDDB_API_KEY}`
          }
        }
      );

      const logoCount = response.data.data ? response.data.data.length : 0;

      if (logoCount > 0) {
        console.log(`✓ ${sub.name} (${sub.gameId}): ${logoCount} logos disponibles`);
        withLogos++;
      } else {
        console.log(`✗ ${sub.name} (${sub.gameId}): Aucun logo`);
        withoutLogos++;
      }
    } catch (error) {
      console.log(`✗ ${sub.name} (${sub.gameId}): Erreur API - ${error.response?.status || error.message}`);
      withoutLogos++;
    }

    // Rate limiting
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
  }

  console.log(`\n---Résumé---`);
  console.log(`Avec logos SteamGridDB : ${withLogos}`);
  console.log(`Sans logos : ${withoutLogos}`);
  console.log(`Total vérifiés : ${subscriptions.length}`);
  console.log(`Potentiel enrichissement : ${withLogos} / ${subscriptions.length} (${Math.round(withLogos / subscriptions.length * 100)}%)`);

  await mongoose.disconnect();
}

checkLogosAvailability().catch((err) => {
  console.error('Erreur:', err);
  process.exit(1);
});
