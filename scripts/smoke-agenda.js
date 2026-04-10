/**
 * Smoke test Agenda : valide initAgenda() → agendaJobs → stopAgenda() sans
 * déclencher aucun handler métier.
 *
 * Sécurité temporelle : Agenda a `processEvery: '30 seconds'`. Tant que ce
 * script termine en moins de ~30s, aucun job ne peut poll la queue et donc
 * aucun handler (news-check, user-group-sync, wishlist-sync) ne tourne.
 * Zéro appel Steam, zéro push FCM.
 *
 * Couvre :
 *   - Phase 1 : boot → 3 docs agendaJobs avec bons repeatInterval/Timezone/nextRunAt
 *   - Phase 2 : stopAgenda propre
 *   - Phase 3 : re-init idempotent (toujours 3 docs, mêmes _id)
 *
 * Usage : node scripts/smoke-agenda.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const {
  connectDatabase,
  disconnectDatabase,
} = require('../src/database/connection');
const { initAgenda, stopAgenda } = require('../src/config/cron');

const EXPECTED_JOBS = {
  'news-check': { minute: 0, hourRange: null },
  'user-group-sync': { minute: 0, hourRange: [3, 14] },
  'wishlist-sync': { minute: 30, hourRange: [3, 14] },
};

/** Interprète un Date en heure/minute Europe/Paris (indépendant de la tz machine) */
function parisHM(date) {
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return {
    h: Number(parts.find((p) => p.type === 'hour')?.value),
    m: Number(parts.find((p) => p.type === 'minute')?.value),
  };
}

let failures = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.error(`  ❌ FAIL: ${msg}`);
    failures += 1;
  }
}

async function dumpJobs() {
  return mongoose.connection.db
    .collection('agendaJobs')
    .find({})
    .toArray();
}

function formatJob(d) {
  return (
    `    - ${d.name} | interval=${d.repeatInterval} | ` +
    `tz=${d.repeatTimezone} | nextRunAt=${d.nextRunAt?.toISOString()} | ` +
    `lockedAt=${d.lockedAt ? 'YES' : 'no'}`
  );
}

async function main() {
  const startedAt = Date.now();
  console.log('== SMOKE AGENDA - START ==');
  console.log(`Node ${process.version} | now UTC ${new Date().toISOString()}`);

  await connectDatabase();

  // --- État initial ---
  const before = await dumpJobs();
  console.log(`\n[BEFORE] agendaJobs count = ${before.length}`);
  before.forEach((d) => console.log(formatJob(d)));

  const lockedExisting = before.filter((d) => d.lockedAt);
  if (lockedExisting.length > 0) {
    console.warn(
      `  ⚠️  ${lockedExisting.length} job(s) actuellement lockedAt ` +
        `(${lockedExisting.map((d) => d.name).join(',')}) — un autre worker tourne peut-être`
    );
  }

  // --- PHASE 1 : init + vérifs ---
  console.log('\n[PHASE 1] initAgenda()');
  await initAgenda();

  const phase1 = await dumpJobs();
  console.log(`  agendaJobs count = ${phase1.length}`);
  phase1.forEach((d) => console.log(formatJob(d)));

  const byName = Object.fromEntries(phase1.map((d) => [d.name, d]));
  const relevantPhase1 = phase1.filter((d) =>
    Object.keys(EXPECTED_JOBS).includes(d.name)
  );
  assert(
    relevantPhase1.length === 3,
    `Exactement 3 jobs attendus dans agendaJobs (found ${relevantPhase1.length})`
  );

  for (const [name, expected] of Object.entries(EXPECTED_JOBS)) {
    const doc = byName[name];
    if (!doc) {
      assert(false, `Job "${name}" manquant`);
      continue;
    }
    assert(
      doc.repeatTimezone === 'Europe/Paris',
      `"${name}" repeatTimezone === Europe/Paris (got ${doc.repeatTimezone})`
    );
    assert(
      typeof doc.repeatInterval === 'string' && doc.repeatInterval.length > 0,
      `"${name}" repeatInterval set (${doc.repeatInterval})`
    );
    assert(
      doc.nextRunAt instanceof Date,
      `"${name}" nextRunAt est bien un Date`
    );
    assert(!doc.lockedAt, `"${name}" pas lockedAt après init`);

    // Vérif nextRunAt en Europe/Paris (indépendant de la tz machine)
    const { h, m } = parisHM(doc.nextRunAt);
    assert(
      m === expected.minute,
      `"${name}" nextRunAt minute=${m} === ${expected.minute} (Paris)`
    );
    if (expected.hourRange) {
      const [lo, hi] = expected.hourRange;
      assert(
        h >= lo && h <= hi,
        `"${name}" nextRunAt hour=${h} ∈ [${lo}..${hi}] (Paris)`
      );
    }
  }

  // --- PHASE 2 : stopAgenda ---
  console.log('\n[PHASE 2] stopAgenda()');
  await stopAgenda();
  assert(true, 'stopAgenda() n\'a pas throw');

  // --- PHASE 3 : idempotence ---
  console.log('\n[PHASE 3] initAgenda() #2 (idempotence)');
  await initAgenda();
  const phase3 = await dumpJobs();
  const relevantPhase3 = phase3.filter((d) =>
    Object.keys(EXPECTED_JOBS).includes(d.name)
  );
  console.log(`  agendaJobs count = ${phase3.length}, relevant = ${relevantPhase3.length}`);
  assert(
    relevantPhase3.length === 3,
    `Re-init reste à 3 jobs relevant (pas de doublon)`
  );

  const idsBefore = relevantPhase1
    .map((d) => d._id.toString())
    .sort();
  const idsAfter = relevantPhase3.map((d) => d._id.toString()).sort();
  assert(
    JSON.stringify(idsBefore) === JSON.stringify(idsAfter),
    '_id inchangés après re-init (agenda.every() idempotent)'
  );

  await stopAgenda();

  // --- Teardown ---
  await disconnectDatabase();
  const elapsed = Date.now() - startedAt;
  console.log(`\n== SMOKE AGENDA - ${failures === 0 ? 'OK' : 'FAILED'} in ${elapsed}ms ==`);
  console.log(
    `(safety: ${elapsed}ms < 30000ms processEvery → aucun handler n'a pu tourner)`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nSMOKE AGENDA CRASHED:', err?.stack || err);
  try {
    await stopAgenda();
  } catch {
    /* noop */
  }
  try {
    await disconnectDatabase();
  } catch {
    /* noop */
  }
  process.exit(1);
});
