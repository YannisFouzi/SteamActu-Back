/**
 * Migration : renomme la base MongoDB `test` en `gamenews`.
 *
 * Procédure en 3 phases (ne supprime JAMAIS la base source) :
 *   1. Backup local de toutes les collections de `test` dans ../backup/test-<date>/
 *   2. Copie data + indexes de `test` vers `gamenews` (drop target avant si existe)
 *   3. Vérification : count de chaque collection doit matcher entre source et target
 *
 * La base `test` reste intacte jusqu'à ce que l'user valide via un autre script (drop-test-db.js).
 *
 * Usage : node scripts/migrate-db-rename.js
 */

const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

require('dotenv').config();

const SOURCE_DB = 'test';
const TARGET_DB = 'gamenews';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI manquant dans backend/.env');

  const date = new Date().toISOString().slice(0, 10);
  const backupDir = path.resolve(__dirname, '..', '..', 'backup', `test-${date}`);

  console.log('='.repeat(60));
  console.log('MIGRATION MongoDB :', SOURCE_DB, '->', TARGET_DB);
  console.log('Backup :', backupDir);
  console.log('='.repeat(60));

  fs.mkdirSync(backupDir, { recursive: true });

  const client = new MongoClient(uri);
  await client.connect();

  const src = client.db(SOURCE_DB);
  const tgt = client.db(TARGET_DB);

  const tgtCollectionsExisting = await tgt.listCollections().toArray();
  if (tgtCollectionsExisting.length > 0) {
    console.log(`\n[!] La base '${TARGET_DB}' existe deja avec ${tgtCollectionsExisting.length} collections.`);
    console.log('    Les collections cibles seront droppees avant la copie.\n');
  }

  const collections = await src.listCollections().toArray();
  console.log(`\nCollections trouvees dans '${SOURCE_DB}' : ${collections.length}\n`);

  const report = [];

  for (const col of collections) {
    const name = col.name;
    const srcCol = src.collection(name);
    const tgtCol = tgt.collection(name);

    const docs = await srcCol.find({}).toArray();

    const backupFile = path.join(backupDir, `${name}.json`);
    fs.writeFileSync(backupFile, EJSON.stringify(docs, { relaxed: false }, 2));
    console.log(`[BACKUP]  ${name.padEnd(25)} ${String(docs.length).padStart(6)} docs -> ${path.basename(backupFile)}`);

    try { await tgtCol.drop(); } catch (e) { /* collection n'existe pas, OK */ }

    if (docs.length > 0) {
      await tgtCol.insertMany(docs, { ordered: false });
    }

    const indexes = await srcCol.listIndexes().toArray();
    let indexesCopied = 0;
    for (const idx of indexes) {
      if (idx.name === '_id_') continue;
      const { key, name: idxName, v, ns, ...options } = idx;
      try {
        await tgtCol.createIndex(key, { name: idxName, ...options });
        indexesCopied++;
      } catch (e) {
        console.log(`  [WARN] index ${idxName} sur ${name} : ${e.message}`);
      }
    }

    const srcCount = await srcCol.countDocuments();
    const tgtCount = await tgtCol.countDocuments();
    const ok = srcCount === tgtCount;
    const status = ok ? 'OK' : 'MISMATCH';
    console.log(`[COPY]    ${name.padEnd(25)} ${String(srcCount).padStart(6)} -> ${String(tgtCount).padStart(6)}  [${status}]  (+${indexesCopied} indexes)`);
    console.log('');

    report.push({ name, srcCount, tgtCount, ok, indexesCopied });
  }

  console.log('='.repeat(60));
  console.log('RESUME FINAL');
  console.log('='.repeat(60));

  const allOk = report.every((r) => r.ok);
  const totalSrc = report.reduce((a, r) => a + r.srcCount, 0);
  const totalTgt = report.reduce((a, r) => a + r.tgtCount, 0);

  console.log(`Collections migrees : ${report.length}`);
  console.log(`Documents sources   : ${totalSrc}`);
  console.log(`Documents cibles    : ${totalTgt}`);
  console.log(`Statut global       : ${allOk ? 'OK - ZERO PERTE' : 'ECHEC - des counts ne matchent pas'}`);
  console.log(`Backup local        : ${backupDir}`);
  console.log(`Base source '${SOURCE_DB}' : INTACTE (non supprimee)`);
  console.log(`Base cible  '${TARGET_DB}' : pret a l'emploi`);

  if (!allOk) {
    console.log('\n[!] Une ou plusieurs collections ont des counts differents. NE PAS basculer le backend.');
    await client.close();
    process.exit(1);
  }

  console.log('\nProchaine etape : mettre a jour MONGODB_URI (local + Railway) et redemarrer.');
  console.log(`  Local   : ${path.resolve(__dirname, '..', '.env')} -> ajouter /${TARGET_DB} dans l'URI`);
  console.log(`  Railway : dashboard -> Variables -> MONGODB_URI (meme modif)`);

  await client.close();
}

main().catch((err) => {
  console.error('[ERREUR MIGRATION]', err);
  process.exit(1);
});
