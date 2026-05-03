/**
 * Migration one-shot : User.followedGames [String] -> [{ appId, followedAt }]
 *
 * Usage :
 *   node scripts/migrate-followed-games-schema.js            # dry-run (défaut)
 *   node scripts/migrate-followed-games-schema.js --apply    # exécute la migration
 *
 * Détecte les users dont followedGames contient au moins un string, et convertit
 * chaque entry en { appId: <string>, followedAt: <Date> }.
 *
 * Pour les users historiques sans timestamp, followedAt est backfillé à epoch (0).
 * Raison : ne pas mentir. Un tri "Récents" placera ces anciens suivis en bas,
 * et les nouveaux follows (après migration) en haut.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const SERVER_MONGODB_URI = process.env.MONGODB_URI;
const APPLY_FLAG = process.argv.includes('--apply');
const EPOCH_BACKFILL = new Date(0);

async function main() {
  if (!SERVER_MONGODB_URI) {
    console.error('[MIGRATION] MONGODB_URI manquant dans .env');
    process.exit(1);
  }

  console.log(
    `[MIGRATION] Mode : ${APPLY_FLAG ? 'APPLY (écriture)' : 'DRY-RUN (lecture seule)'}`
  );

  await mongoose.connect(SERVER_MONGODB_URI);
  console.log('[MIGRATION] Connexion Mongo OK');

  // On lit en raw via la collection pour voir les documents sous leur forme
  // legacy (array de strings), car Mongoose auto-caste à l'accès en mode schéma
  // — ce qui masquerait les entrées à migrer.
  const usersCollection = mongoose.connection.collection('users');

  const cursor = usersCollection.find({ followedGames: { $exists: true } });
  let scanned = 0;
  let toMigrate = 0;
  let migrated = 0;
  let alreadyOk = 0;

  for await (const doc of cursor) {
    scanned++;
    const entries = Array.isArray(doc.followedGames) ? doc.followedGames : [];
    if (entries.length === 0) {
      alreadyOk++;
      continue;
    }

    const needsMigration = entries.some((entry) => typeof entry === 'string');
    if (!needsMigration) {
      alreadyOk++;
      continue;
    }

    toMigrate++;

    const converted = entries
      .map((entry) => {
        if (typeof entry === 'string') {
          return { appId: entry, followedAt: EPOCH_BACKFILL };
        }
        if (entry && typeof entry === 'object' && entry.appId) {
          return {
            appId: String(entry.appId),
            followedAt: entry.followedAt || EPOCH_BACKFILL,
          };
        }
        return null;
      })
      .filter(Boolean);

    console.log(
      `[MIGRATION] steamId=${doc.steamId} : ${entries.length} entry(ies) -> ${converted.length} objets`
    );

    if (APPLY_FLAG) {
      await usersCollection.updateOne(
        { _id: doc._id },
        { $set: { followedGames: converted } }
      );
      migrated++;
    }
  }

  console.log('\n[MIGRATION] Résumé');
  console.log(`  - Users scannés          : ${scanned}`);
  console.log(`  - Déjà OK (pas d'action) : ${alreadyOk}`);
  console.log(`  - À migrer               : ${toMigrate}`);
  console.log(`  - Effectivement migrés   : ${migrated}`);
  if (!APPLY_FLAG && toMigrate > 0) {
    console.log('\n[MIGRATION] Relancez avec --apply pour effectuer les écritures.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[MIGRATION] Erreur fatale :', err);
  process.exit(1);
});
