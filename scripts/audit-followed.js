require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const conn = mongoose.connection;
  const users = conn.collection('users');
  const gameSubs = conn.collection('gamesubscriptions');

  const all = await users.find({}).toArray();

  console.log('=== Users.followedGames vs GameSubscriptions.subscribers ===');
  for (const u of all) {
    const fg = u.followedGames || [];
    const subs = await gameSubs
      .find({ subscribers: u.steamId })
      .project({ gameId: 1, name: 1, subscribers: 1 })
      .toArray();

    console.log(`\nsteamId=${u.steamId}`);
    console.log(`  User.followedGames count = ${fg.length}`);
    console.log(`  GameSubs where subscribers contains this steamId = ${subs.length}`);
    console.log(`  -> Liste des appIds suivis (depuis GameSubscription):`);
    for (const s of subs.slice(0, 30)) {
      console.log(`     ${s.gameId} - "${s.name}"`);
    }
    if (subs.length > 30) console.log(`     ... +${subs.length - 30} autres`);
  }

  // Check raw shape of one subscribers field
  console.log('\n=== Raw shape sample ===');
  const sample = await gameSubs.findOne({});
  console.log(`gameId=${sample.gameId} subscribers raw =`, JSON.stringify(sample.subscribers));

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
