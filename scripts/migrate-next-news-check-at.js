/**
 * Migration : backfill du champ `nextNewsCheckAt` sur GameSubscription.
 *
 * Règles (§2 du plan adaptive-news-polling) :
 *   - Jeux JAMAIS vérifiés (lastNewsCheck == null) → pas de backfill,
 *     restent éligibles immédiatement (nextNewsCheckAt: null) → bonne UX.
 *   - Jeux DÉJÀ vérifiés (lastNewsCheck != null) → backfill aléatoire
 *     étalé sur 1 h pour éviter un pic API au premier run post-déploiement.
 *
 * Idempotent : ne touche que les documents sans nextNewsCheckAt.
 *
 * Usage : node scripts/migrate-next-news-check-at.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const {
  connectDatabase,
  disconnectDatabase,
} = require('../src/database/connection');

const SPREAD_MS = 60 * 60 * 1000; // 1 h d'étalement

async function main() {
  console.log('== MIGRATION nextNewsCheckAt — START ==');
  await connectDatabase();

  const collection = mongoose.connection.db.collection('gamesubscriptions');

  // Compter les documents concernés
  const alreadyChecked = await collection.countDocuments({
    lastNewsCheck: { $ne: null },
    nextNewsCheckAt: null,
  });
  const neverChecked = await collection.countDocuments({
    lastNewsCheck: null,
    nextNewsCheckAt: null,
  });

  console.log(`  Déjà vérifiés sans nextNewsCheckAt : ${alreadyChecked}`);
  console.log(`  Jamais vérifiés (inchangés)       : ${neverChecked}`);

  if (alreadyChecked === 0) {
    console.log('  Rien à migrer.');
    await disconnectDatabase();
    console.log('== MIGRATION nextNewsCheckAt — DONE ==');
    return;
  }

  // Backfill : pour chaque doc déjà vérifié, poser un nextNewsCheckAt
  // aléatoire dans [now, now + 1h] → étale le premier run
  const cursor = collection.find({
    lastNewsCheck: { $ne: null },
    nextNewsCheckAt: null,
  });

  const bulkOps = [];
  const now = Date.now();

  for await (const doc of cursor) {
    const randomOffset = Math.floor(Math.random() * SPREAD_MS);
    bulkOps.push({
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            nextNewsCheckAt: new Date(now + randomOffset),
          },
        },
      },
    });

    // Flush par batch de 500
    if (bulkOps.length >= 500) {
      await collection.bulkWrite(bulkOps, { ordered: false });
      console.log(`  ... ${bulkOps.length} documents mis à jour`);
      bulkOps.length = 0;
    }
  }

  // Flush restant
  if (bulkOps.length > 0) {
    await collection.bulkWrite(bulkOps, { ordered: false });
    console.log(`  ... ${bulkOps.length} documents mis à jour`);
  }

  console.log(`  Total backfillé : ${alreadyChecked} documents`);
  await disconnectDatabase();
  console.log('== MIGRATION nextNewsCheckAt — DONE ==');
}

main().catch(async (err) => {
  console.error('MIGRATION CRASHED:', err?.stack || err);
  try {
    await disconnectDatabase();
  } catch {
    /* noop */
  }
  process.exit(1);
});
