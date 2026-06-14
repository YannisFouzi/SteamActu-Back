/**
 * Backfill des followedGames[].followedAt manquants / epoch-0.
 *
 * Contexte : d'anciennes entrées followedGames ont été écrites par une migration
 * brute (raw $push sans _id), avec followedAt = Date(0) (1970). Le schéma actuel
 * (`default: Date.now`) et `buildFollowedGamesEntry` n'en créent plus — c'est un
 * reliquat. Un followedAt à 1970 casse le tri "Récents" (onglet Jeux suivis).
 *
 * Aucune vraie date de follow par-jeu n'est récupérable (pas de _id sur ces
 * sous-docs). On backfille avec la date de CRÉATION DU COMPTE
 * (user._id.getTimestamp()) : ces follows sont les plus anciens de l'user
 * (onboarding) → ils restent en bas du tri "Récents", sans le 1970.
 *
 * Usage :
 *   node scripts/backfill-followed-at.js            # dry-run (n'écrit rien)
 *   node scripts/backfill-followed-at.js --apply    # applique
 */

require('./_loadEnv');
const mongoose = require('mongoose');
const User = require('../src/models/User');

const APPLY = process.argv.includes('--apply');

function isEpochOrMissing(followedAt) {
  if (!followedAt) return true; // null / undefined
  return new Date(followedAt).getTime() === 0; // epoch 0 (1970)
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const users = await User.find({}, { steamId: 1, followedGames: 1 });
  let usersTouched = 0;
  let entriesFixed = 0;

  for (const user of users) {
    const accountCreatedAt = user._id.getTimestamp();
    let changed = 0;

    for (const entry of user.followedGames || []) {
      // On ne touche que les objets ; un éventuel entry string sera converti
      // ailleurs (rebuild sync) — hors scope de ce backfill.
      if (entry && typeof entry === 'object' && isEpochOrMissing(entry.followedAt)) {
        entry.followedAt = accountCreatedAt;
        changed++;
      }
    }

    if (changed > 0) {
      usersTouched++;
      entriesFixed += changed;
      console.log(
        `  steamId=${user.steamId}: ${changed} entrée(s) → followedAt=${accountCreatedAt.toISOString()} (création compte)`
      );
      if (APPLY) {
        user.markModified('followedGames');
        await user.save();
      }
    }
  }

  console.log(
    `\n${APPLY ? '[APPLIQUÉ]' : '[DRY-RUN]'} ${entriesFixed} entrée(s) sur ${usersTouched} user(s).` +
      (APPLY ? '' : ' Relance avec --apply pour écrire.')
  );

  await mongoose.connection.close();
})().catch((e) => {
  console.error('ERR', e);
  process.exit(1);
});
