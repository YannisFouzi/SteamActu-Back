/**
 * Script one-shot : répare les GameSubscription dont imageUrl est vide ('').
 *
 * Pour chaque doc concerné :
 *   1. Appelle getGameImage(appId, name) → la cascade complète avec 5ème étage
 *   2. Si une URL est trouvée, met à jour GameSubscription.imageUrl
 *   3. Log le résultat (réparé / toujours introuvable)
 *
 * Usage:
 *   node scripts/repair-missing-images.js           → dry-run (lecture seule)
 *   node scripts/repair-missing-images.js --apply   → applique les updates
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const GameSubscription = require('../src/models/GameSubscription');
const { getGameImage } = require('../src/services/steamGridDbService');

const APPLY = process.argv.includes('--apply');

async function run() {
  console.log('='.repeat(70));
  console.log(`[REPAIR] Mode: ${APPLY ? 'APPLY (écriture)' : 'DRY-RUN (lecture seule)'}`);
  console.log('='.repeat(70));

  await mongoose.connect(process.env.MONGODB_URI);

  const targets = await GameSubscription.find({
    $or: [{ imageUrl: '' }, { imageUrl: null }, { imageUrl: { $exists: false } }],
  })
    .select('gameId name imageUrl')
    .lean();

  console.log(`\n[REPAIR] ${targets.length} doc(s) à réparer\n`);

  let repaired = 0;
  let stillMissing = 0;

  for (const sub of targets) {
    process.stdout.write(`  - ${sub.gameId} "${sub.name}" → `);
    try {
      const url = await getGameImage(sub.gameId, sub.name);
      if (url) {
        repaired++;
        console.log(`OK ${url.slice(0, 80)}${url.length > 80 ? '...' : ''}`);
        if (APPLY) {
          await GameSubscription.updateOne(
            { gameId: sub.gameId },
            { $set: { imageUrl: url } }
          );
        }
      } else {
        stillMissing++;
        console.log(`(introuvable, même avec fallback nom)`);
      }
    } catch (err) {
      stillMissing++;
      console.log(`ERR ${err.message}`);
    }
  }

  console.log(`\n[REPAIR] Résumé`);
  console.log(`  - Réparés : ${repaired}`);
  console.log(`  - Introuvables : ${stillMissing}`);
  console.log(`  - Total : ${targets.length}`);
  if (!APPLY && repaired > 0) {
    console.log(`\n  [DRY-RUN] Rien n'a été écrit. Relancer avec --apply pour appliquer.`);
  }

  await mongoose.connection.close();
}

run().catch(async (err) => {
  console.error('[REPAIR] Erreur:', err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});
