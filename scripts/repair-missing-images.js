/**
 * Script one-shot : répare les GameSubscription dont imageUrl est vide ('')
 * OU morte (HTTP >= 400 — ex. pattern deviné cdn.cloudflare.../header.jpg
 * qui 404 pour les jeux récents aux assets hashés).
 *
 * Pour chaque doc :
 *   1. imageUrl vide → re-résolution directe
 *   2. imageUrl présente → HEAD check ; si 4xx/5xx → re-résolution
 *   3. Re-résolution = même cascade que addUserToGameSubscription :
 *      getGameImage (SteamGridDB, 5 étages) → fetchGameDetails (Store, URL hashée)
 *   4. Log le résultat (réparé / toujours introuvable / sain)
 *
 * Usage:
 *   node scripts/repair-missing-images.js           → dry-run (lecture seule)
 *   node scripts/repair-missing-images.js --apply   → applique les updates
 */

const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const GameSubscription = require('../src/models/GameSubscription');
const { getGameImage } = require('../src/services/steamGridDbService');
const { fetchGameDetails } = require('../src/services/steam/apiClient');

const APPLY = process.argv.includes('--apply');

/**
 * Vérifie qu'une URL d'image répond. Retourne :
 *   'alive'   — 2xx/3xx (ou 405 : HEAD refusé, on ne conclut pas)
 *   'dead'    — 4xx/5xx
 *   'unknown' — erreur réseau/timeout : on ne touche pas au doc
 */
async function checkImageUrl(url) {
  try {
    const res = await axios.head(url, {
      timeout: 5000,
      validateStatus: () => true,
    });
    if (res.status === 405) return 'alive';
    return res.status < 400 ? 'alive' : 'dead';
  } catch (_) {
    return 'unknown';
  }
}

/** Même cascade que subscriptionManager : SGDB → Store header (URL hashée). */
async function resolveImageUrl(appId, name) {
  const gridDbIcon = await getGameImage(appId, name).catch(() => null);
  if (gridDbIcon) return gridDbIcon;
  const details = await fetchGameDetails(appId).catch(() => null);
  return details?.header_image || null;
}

async function run() {
  console.log('='.repeat(70));
  console.log(`[REPAIR] Mode: ${APPLY ? 'APPLY (écriture)' : 'DRY-RUN (lecture seule)'}`);
  console.log('='.repeat(70));

  await mongoose.connect(process.env.MONGODB_URI);

  const subs = await GameSubscription.find({})
    .select('gameId name imageUrl')
    .lean();

  console.log(`\n[REPAIR] ${subs.length} subscription(s) à inspecter\n`);

  let repaired = 0;
  let stillMissing = 0;
  let healthy = 0;
  let skipped = 0;

  for (const sub of subs) {
    let reason = null;
    if (!sub.imageUrl) {
      reason = 'vide';
    } else {
      const state = await checkImageUrl(sub.imageUrl);
      if (state === 'dead') {
        reason = `morte (${sub.imageUrl.slice(0, 70)}...)`;
      } else if (state === 'unknown') {
        skipped++;
        console.log(`  - ${sub.gameId} "${sub.name}" → SKIP (check réseau indécis)`);
        continue;
      } else {
        healthy++;
        continue;
      }
    }

    process.stdout.write(`  - ${sub.gameId} "${sub.name}" [${reason}] → `);
    try {
      const url = await resolveImageUrl(sub.gameId, sub.name);
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
        console.log(`(introuvable, même via Store)`);
      }
    } catch (err) {
      stillMissing++;
      console.log(`ERR ${err.message}`);
    }
  }

  console.log(`\n[REPAIR] Résumé`);
  console.log(`  - Saines : ${healthy}`);
  console.log(`  - Réparées : ${repaired}`);
  console.log(`  - Introuvables : ${stillMissing}`);
  console.log(`  - Skip (réseau) : ${skipped}`);
  console.log(`  - Total : ${subs.length}`);
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
