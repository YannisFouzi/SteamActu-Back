/**
 * Script one-shot: normalise rtime_last_played dans gameLibrary.games
 *
 * Objectif:
 * - Convertir les valeurs non fiables (0, negatives, NaN, undefined) en null
 * - Conserver les timestamps valides (> 0)
 *
 * Usage:
 *   node scripts/migrate-rtime-last-played-null.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { DATABASE_CONFIG } = require('../src/config/app');

function normalizeLastPlayed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return numeric;
}

async function runMigration() {
  await mongoose.connect(DATABASE_CONFIG.uri, DATABASE_CONFIG.options);
  console.log('Connecte a MongoDB');

  const users = await User.find({}).select('_id steamId gameLibrary.games').lean();
  console.log(`Utilisateurs analyses: ${users.length}`);

  let usersUpdated = 0;
  let gamesUpdated = 0;

  for (const user of users) {
    const currentGames = Array.isArray(user?.gameLibrary?.games)
      ? user.gameLibrary.games
      : [];

    if (currentGames.length === 0) {
      continue;
    }

    let hasChanges = false;
    const nextGames = currentGames.map((game) => {
      const normalized = normalizeLastPlayed(game?.rtime_last_played);
      const previous = game?.rtime_last_played ?? null;

      const changed =
        (normalized === null && previous !== null && Number(previous) !== 0) ||
        (normalized === null && Number(previous) === 0) ||
        (normalized !== null && Number(previous) !== normalized);

      if (!changed) {
        return game;
      }

      hasChanges = true;
      gamesUpdated += 1;
      return {
        ...game,
        rtime_last_played: normalized,
      };
    });

    if (!hasChanges) {
      continue;
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          'gameLibrary.games': nextGames,
          gamesVersion: new Date(),
        },
      }
    );

    usersUpdated += 1;
  }

  console.log('Migration terminee');
  console.log(`Utilisateurs mis a jour: ${usersUpdated}`);
  console.log(`Entrees gameLibrary modifiees: ${gamesUpdated}`);

  await mongoose.disconnect();
}

runMigration().catch((error) => {
  console.error('Erreur migration rtime_last_played:', error);
  process.exit(1);
});
