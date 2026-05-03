/**
 * Restauration one-shot : reconstruit User.followedGames depuis
 * GameSubscription.subscribers (source de vérité de fait).
 *
 * Cause : audit du 2026-04-25 a montré que User.followedGames a été vidé
 * sur les 2 users en base, alors que les GameSubscription préservaient
 * encore leurs steamIds dans subscribers[]. Ce script reconstitue la liste
 * côté User à partir de ces GameSubscription.
 *
 * followedAt : backfill à epoch (1970-01-01) — la vraie date est perdue.
 * Conséquence : un tri "Récents" placera ces entrées tout en bas.
 *
 * Idempotent : ne touche pas un user dont followedGames est déjà cohérent
 * avec les GameSubscription.
 *
 * Usage :
 *   node scripts/restore-followed-games.js              # dry-run
 *   node scripts/restore-followed-games.js --apply      # exécute
 */

require('dotenv').config();
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');
const EPOCH = new Date(0);

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('[RESTORE] MONGODB_URI manquant');
    process.exit(1);
  }

  console.log(
    `[RESTORE] Mode: ${APPLY ? 'APPLY (écriture)' : 'DRY-RUN (lecture seule)'}`
  );

  await mongoose.connect(process.env.MONGODB_URI);
  const conn = mongoose.connection;
  const users = conn.collection('users');
  const gameSubs = conn.collection('gamesubscriptions');

  const allUsers = await users.find({}).toArray();
  console.log(`[RESTORE] ${allUsers.length} user(s) à examiner\n`);

  let touched = 0;

  for (const u of allUsers) {
    const subs = await gameSubs
      .find({ subscribers: u.steamId })
      .project({ gameId: 1 })
      .toArray();

    const recoveredAppIds = subs.map((s) => String(s.gameId)).filter(Boolean);
    const currentEntries = Array.isArray(u.followedGames) ? u.followedGames : [];
    const currentAppIds = new Set(
      currentEntries
        .map((e) =>
          typeof e === 'string'
            ? e
            : e && typeof e === 'object' && e.appId
            ? String(e.appId)
            : null
        )
        .filter(Boolean)
    );

    const missing = recoveredAppIds.filter((id) => !currentAppIds.has(id));

    console.log(`steamId=${u.steamId}`);
    console.log(`  GameSubscription -> ${recoveredAppIds.length} appId(s)`);
    console.log(`  User.followedGames -> ${currentAppIds.size} appId(s)`);
    console.log(`  À ajouter            -> ${missing.length}`);

    if (missing.length === 0) {
      console.log('  -> OK, rien à faire\n');
      continue;
    }

    // On garde les entries existantes (avec leur followedAt actuel) et on
    // ajoute les manquantes avec followedAt = epoch.
    const preserved = currentEntries
      .map((e) => {
        if (typeof e === 'string') {
          return { appId: e, followedAt: EPOCH };
        }
        if (e && typeof e === 'object' && e.appId) {
          return {
            appId: String(e.appId),
            followedAt: e.followedAt || EPOCH,
          };
        }
        return null;
      })
      .filter(Boolean);

    const additions = missing.map((appId) => ({
      appId,
      followedAt: EPOCH,
    }));

    const next = [...preserved, ...additions];

    console.log(
      `  -> Nouveau followedGames : ${next.length} entrée(s) (preserved=${preserved.length} + restored=${additions.length})`
    );

    if (APPLY) {
      await users.updateOne(
        { _id: u._id },
        {
          $set: {
            followedGames: next,
            gamesVersion: new Date(),
          },
        }
      );
      touched++;
      console.log('  -> [APPLY] User mis à jour\n');
    } else {
      console.log('  -> [DRY-RUN] aucune écriture\n');
    }
  }

  console.log(
    `[RESTORE] Terminé. Users modifiés : ${touched}/${allUsers.length}`
  );
  if (!APPLY) {
    console.log('[RESTORE] Relancez avec --apply pour effectuer les écritures.');
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error('[RESTORE] Erreur fatale:', e);
  process.exit(1);
});
